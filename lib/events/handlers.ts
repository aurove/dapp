import "server-only";

import { and, desc, eq, lte } from "drizzle-orm";
import { getAddress, http, createPublicClient, type Abi, type Address, type PublicClient } from "viem";

import {
  ACADEMY_ASSET_FRACTION_REWARDS_CLAIMED_TASK_CODE,
  ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
  ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
  ACADEMY_POINTS_SCALE,
} from "@/lib/academy/constants";
import {
  formatAcademyReferralPoints,
  resolveAcademyUserByWalletAddress,
} from "@/lib/academy/referrals";
import {
  recordAcademyTaskPoints,
  isAcademyProgramActiveAt,
  resolveActiveAcademyProgram,
  resolveAcademyTaskDefinition,
} from "@/lib/academy/tasks/points";
import { db } from "@/lib/db";
import { getKnownMusdConfig } from "@/lib/config/musd";
import { academyAssetFractionMetadata } from "@/lib/db/academy-asset-fraction-schema";
import { marketplacePriceObservations } from "@/lib/db/marketplace-schema";
import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";

import { getRegisteredContract, getRegisteredContractAbi, registerRuntimeContract } from "./contracts";
import { stringifyJsonSafe } from "./json-safe";
import type {
  AnyContractEventHandler,
  ContractEventHandlerContext,
  ContractEventHandlerDefinition,
} from "./types";
import type {
  ContractEventNameForContract,
  ContractName,
  DecodedContractEvent,
} from "@/contracts/event-types";

export { buildHandlerKeyTyped as buildHandlerKey };

const DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
  },
] as const;

const PRICE_SCALE = 10n ** 18n;
const MARKETPLACE_OBSERVATION_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type AssetFractionAssetVariant = "veBTC" | "veMEZO";

type AssetFractionMetadata = {
  chainId: number;
  fractionAddress: Address;
  trancheId: bigint;
  trancheNumber: number;
  assetVariant: AssetFractionAssetVariant;
  fractionName: string | null;
  fractionSymbol: string | null;
  veNFT: Address | null;
  rewardAsset: Address | null;
  trancheDuration: bigint | null;
  source:
    | "deployment_event"
    | "database"
    | "derived_symbol"
    | "derived_ledger"
    | "runtime_registry"
    | "static_registry"
    | "onchain";
  deploymentBlock: number | null;
};

type ResolveAssetFractionMetadataResult =
  | {
      status: "resolved";
      metadata: AssetFractionMetadata;
    }
  | {
      status: "skipped";
      reason: "fraction_metadata_missing" | "fraction_tranche_id_unresolved" | "fraction_asset_variant_unknown";
    };

let marketplaceObservationClient: PublicClient | null = null;
let marketplaceObservationRpcUrl: string | null = null;
const assetFractionMetadataCache = new Map<string, AssetFractionMetadata>();

function getMarketplaceObservationRpcUrl(): string {
  const configured =
    process.env.MARKETPLACE_PRICE_RPC_URL?.trim() ||
    process.env.EVENTS_RELAY_RPC_URL?.trim() ||
    process.env.RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim();

  return configured && configured.length > 0 ? configured : "http://127.0.0.1:8545";
}

function getMarketplaceObservationClient(): PublicClient {
  const rpcUrl = getMarketplaceObservationRpcUrl();
  if (!marketplaceObservationClient || marketplaceObservationRpcUrl !== rpcUrl) {
    marketplaceObservationClient = createPublicClient({
      transport: http(rpcUrl, { timeout: 15_000 }),
    });
    marketplaceObservationRpcUrl = rpcUrl;
  }

  return marketplaceObservationClient;
}

function toBigIntValue(value: unknown, fallback?: bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && value.trim().length > 0) return BigInt(value.trim());
  if (fallback !== undefined) return fallback;
  throw new Error(`Expected bigint-compatible value, received ${String(value)}.`);
}

function toAddressValue(value: unknown): Address {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected address-compatible value, received ${String(value)}.`);
  }

  return getAddress(value);
}

function toOptionalStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function readDecimals(address: Address): Promise<number> {
  try {
    const result = await getMarketplaceObservationClient().readContract({
      address,
      abi: DECIMALS_ABI,
      functionName: "decimals",
    });

    return Number(result);
  } catch {
    return 18;
  }
}

function getAssetFractionCacheKey(chainId: number, fractionAddress: Address): string {
  return `${chainId}:${getAddress(fractionAddress).toLowerCase()}`;
}

function getSharedAssetFractionAbi(): Abi | null {
  return getRegisteredContractAbi("AssetFraction") as Abi | null;
}

function hasAbiFunction(abi: Abi, functionName: string): boolean {
  return abi.some((entry) => entry.type === "function" && entry.name === functionName);
}

function decodeAssetFractionVariant(trancheId: bigint): AssetFractionAssetVariant | null {
  const trancheNumber = trancheId & 0xffffn;
  const variantPart = (trancheId >> 16n) & 0xffn;
  const normalized = (variantPart << 16n) | trancheNumber;

  if (
    (variantPart !== 1n && variantPart !== 2n) ||
    trancheNumber < 1n ||
    trancheNumber > 208n ||
    normalized !== trancheId
  ) {
    return null;
  }

  return variantPart === 1n ? "veBTC" : "veMEZO";
}

async function readContractView<T>(input: {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: number;
}): Promise<T | null> {
  if (!hasAbiFunction(input.abi, input.functionName)) {
    return null;
  }

  try {
    const result = await getMarketplaceObservationClient().readContract({
      address: input.address,
      abi: input.abi,
      functionName: input.functionName as never,
      args: input.args as never,
      blockNumber: input.blockNumber == null ? undefined : BigInt(input.blockNumber),
    });

    return result as T;
  } catch {
    return null;
  }
}

function cacheAssetFractionMetadata(metadata: AssetFractionMetadata): AssetFractionMetadata {
  const normalized: AssetFractionMetadata = {
    ...metadata,
    fractionAddress: getAddress(metadata.fractionAddress),
    fractionName: metadata.fractionName ?? null,
    fractionSymbol: metadata.fractionSymbol ?? null,
    veNFT: metadata.veNFT ? getAddress(metadata.veNFT) : null,
    rewardAsset: metadata.rewardAsset ? getAddress(metadata.rewardAsset) : null,
    deploymentBlock:
      metadata.deploymentBlock != null && Number.isInteger(metadata.deploymentBlock)
        ? metadata.deploymentBlock
        : null,
  };

  assetFractionMetadataCache.set(
    getAssetFractionCacheKey(normalized.chainId, normalized.fractionAddress),
    normalized,
  );

  const assetFractionAbi = getSharedAssetFractionAbi();
  if (assetFractionAbi) {
    registerRuntimeContract({
      chainId: normalized.chainId,
      address: normalized.fractionAddress,
      contractName: "AssetFraction",
      abi: assetFractionAbi,
      deploymentBlock: normalized.deploymentBlock,
      source: "runtime",
    });
  }

  return normalized;
}

function normalizeAssetFractionMetadataRow(row: typeof academyAssetFractionMetadata.$inferSelect): AssetFractionMetadata {
  return {
    chainId: row.chainId,
    fractionAddress: getAddress(row.fractionAddress),
    trancheId: toBigIntValue(row.trancheId),
    trancheNumber: row.trancheNumber,
    assetVariant: row.assetVariant as AssetFractionAssetVariant,
    fractionName: row.fractionName,
    fractionSymbol: row.fractionSymbol,
    veNFT: row.veNft ? getAddress(row.veNft) : null,
    rewardAsset: row.rewardAsset ? getAddress(row.rewardAsset) : null,
    trancheDuration: row.trancheDuration == null ? null : toBigIntValue(row.trancheDuration),
    source: row.source as AssetFractionMetadata["source"],
    deploymentBlock: row.deploymentBlock,
  };
}

async function loadPersistedAssetFractionMetadata(input: {
  chainId: number;
  fractionAddress: Address;
}): Promise<AssetFractionMetadata | null> {
  const rows = await db
    .select()
    .from(academyAssetFractionMetadata)
    .where(
      and(
        eq(academyAssetFractionMetadata.chainId, input.chainId),
        eq(academyAssetFractionMetadata.fractionAddress, getAddress(input.fractionAddress).toLowerCase()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return normalizeAssetFractionMetadataRow(row);
}

async function persistAssetFractionMetadata(metadata: AssetFractionMetadata): Promise<AssetFractionMetadata> {
  const normalized = cacheAssetFractionMetadata(metadata);

  await db
    .insert(academyAssetFractionMetadata)
    .values({
      chainId: normalized.chainId,
      fractionAddress: normalized.fractionAddress.toLowerCase(),
      trancheId: normalized.trancheId.toString(),
      trancheNumber: normalized.trancheNumber,
      assetVariant: normalized.assetVariant,
      fractionName: normalized.fractionName,
      fractionSymbol: normalized.fractionSymbol,
      veNft: normalized.veNFT?.toLowerCase() ?? null,
      rewardAsset: normalized.rewardAsset?.toLowerCase() ?? null,
      trancheDuration: normalized.trancheDuration?.toString() ?? null,
      source: normalized.source,
      deploymentBlock: normalized.deploymentBlock,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [academyAssetFractionMetadata.chainId, academyAssetFractionMetadata.fractionAddress],
      set: {
        trancheId: normalized.trancheId.toString(),
        trancheNumber: normalized.trancheNumber,
        assetVariant: normalized.assetVariant,
        fractionName: normalized.fractionName,
        fractionSymbol: normalized.fractionSymbol,
        veNft: normalized.veNFT?.toLowerCase() ?? null,
        rewardAsset: normalized.rewardAsset?.toLowerCase() ?? null,
        trancheDuration: normalized.trancheDuration?.toString() ?? null,
        source: normalized.source,
        deploymentBlock: normalized.deploymentBlock,
        updatedAt: new Date().toISOString(),
      },
    });

  return normalized;
}

function parseAssetFractionSymbol(symbol: string): { assetVariant: AssetFractionAssetVariant; trancheNumber: number } | null {
  const match = symbol.trim().match(/^av(BTC|MEZO)w(\d+)$/);
  if (!match) {
    return null;
  }

  const trancheNumber = Number(match[2]);
  if (!Number.isInteger(trancheNumber) || trancheNumber < 1 || trancheNumber > 208) {
    return null;
  }

  return {
    assetVariant: match[1] === "BTC" ? "veBTC" : "veMEZO",
    trancheNumber,
  };
}

function deriveAssetFractionTrancheId(input: {
  symbol: string | null;
  name: string | null;
}): { trancheId: bigint; trancheNumber: number; assetVariant: AssetFractionAssetVariant; source: "derived_symbol" } | null {
  if (input.symbol) {
    const parsed = parseAssetFractionSymbol(input.symbol);
    if (parsed) {
      const trancheId = ((parsed.assetVariant === "veBTC" ? 1n : 2n) << 16n) | BigInt(parsed.trancheNumber);
      return {
        trancheId,
        trancheNumber: parsed.trancheNumber,
        assetVariant: parsed.assetVariant,
        source: "derived_symbol",
      };
    }
  }

  if (input.name) {
    const match = input.name.trim().match(/^(.*)\s-\s(\d+)\sWeeks$/i);
    if (match) {
      const trancheNumber = Number(match[2]);
      if (Number.isInteger(trancheNumber) && trancheNumber >= 1 && trancheNumber <= 208) {
        const assetVariant = match[1].toLowerCase().includes("mezo") ? "veMEZO" : match[1].toLowerCase().includes("btc") ? "veBTC" : null;
        if (assetVariant) {
          const trancheId = (assetVariant === "veBTC" ? 1n : 2n) << 16n | BigInt(trancheNumber);
          return {
            trancheId,
            trancheNumber,
            assetVariant,
            source: "derived_symbol",
          };
        }
      }
    }
  }

  return null;
}

async function deriveAssetFractionMetadataFromLedger(input: {
  chainId: number;
  ledgerAddress: Address;
  fractionAddress: Address;
  blockNumber?: number;
}): Promise<{ trancheId: bigint; trancheNumber: number; assetVariant: AssetFractionAssetVariant; source: "derived_ledger" } | null> {
  const ledgerContract = getRegisteredContract(input.chainId, input.ledgerAddress);
  const ledgerAbi = ledgerContract?.abi ?? null;
  if (!ledgerAbi || !hasAbiFunction(ledgerAbi, "assetFractionOfId")) {
    return null;
  }

  const candidateTrancheIds: bigint[] = [];
  for (const variantPart of [1n, 2n]) {
    for (let trancheNumber = 1; trancheNumber <= 208; trancheNumber += 1) {
      candidateTrancheIds.push((variantPart << 16n) | BigInt(trancheNumber));
    }
  }

  const batchSize = 24;
  for (let index = 0; index < candidateTrancheIds.length; index += batchSize) {
    const trancheIdBatch = candidateTrancheIds.slice(index, index + batchSize);
    const matches = await Promise.all(
      trancheIdBatch.map(async (trancheId) => {
        const fractionResult = await readContractView<Address>({
          address: input.ledgerAddress,
          abi: ledgerAbi,
          functionName: "assetFractionOfId",
          args: [trancheId],
          blockNumber: input.blockNumber,
        });

        return fractionResult && getAddress(fractionResult).toLowerCase() === getAddress(input.fractionAddress).toLowerCase()
          ? trancheId
          : null;
      }),
    );

    const matchedTrancheId = matches.find((value) => value !== null);
    if (matchedTrancheId) {
      const assetVariant = decodeAssetFractionVariant(matchedTrancheId);
      if (!assetVariant) {
        return null;
      }

      return {
        trancheId: matchedTrancheId,
        trancheNumber: Number(matchedTrancheId & 0xffffn),
        assetVariant,
        source: "derived_ledger",
      };
    }
  }

  return null;
}

export async function resolveAssetFractionMetadata(input: {
  chainId: number;
  fractionAddress: Address;
  ledgerAddress?: Address;
  blockNumber?: number;
}): Promise<ResolveAssetFractionMetadataResult> {
  const cacheKey = getAssetFractionCacheKey(input.chainId, input.fractionAddress);
  const cached = assetFractionMetadataCache.get(cacheKey);
  if (cached) {
    return { status: "resolved", metadata: cached };
  }

  const persisted = await loadPersistedAssetFractionMetadata({
    chainId: input.chainId,
    fractionAddress: input.fractionAddress,
  });
  if (persisted) {
    cacheAssetFractionMetadata(persisted);
    return { status: "resolved", metadata: persisted };
  }

  const fractionContract = getRegisteredContract(input.chainId, input.fractionAddress);
  const assetFractionAbi = getSharedAssetFractionAbi() ?? fractionContract?.abi ?? null;
  if (!assetFractionAbi) {
    return { status: "skipped", reason: "fraction_metadata_missing" };
  }

  const nameResult = await readContractView<string>({
    address: input.fractionAddress,
    abi: assetFractionAbi,
    functionName: "name",
    blockNumber: input.blockNumber,
  });
  const symbolResult = await readContractView<string>({
    address: input.fractionAddress,
    abi: assetFractionAbi,
    functionName: "symbol",
    blockNumber: input.blockNumber,
  });
  const veNFTResult = await readContractView<Address>({
    address: input.fractionAddress,
    abi: assetFractionAbi,
    functionName: "veNFT",
    blockNumber: input.blockNumber,
  });
  const rewardAssetResult = await readContractView<Address>({
    address: input.fractionAddress,
    abi: assetFractionAbi,
    functionName: "rewardAsset",
    blockNumber: input.blockNumber,
  });
  const trancheDurationResult = await readContractView<bigint | number>({
    address: input.fractionAddress,
    abi: assetFractionAbi,
    functionName: "trancheDuration",
    blockNumber: input.blockNumber,
  });

  const derived = deriveAssetFractionTrancheId({
    symbol: symbolResult,
    name: nameResult,
  }) ?? (input.ledgerAddress
    ? await deriveAssetFractionMetadataFromLedger({
        chainId: input.chainId,
        ledgerAddress: input.ledgerAddress,
        fractionAddress: input.fractionAddress,
        blockNumber: input.blockNumber,
      })
    : null);
  if (!derived) {
    return { status: "skipped", reason: "fraction_tranche_id_unresolved" };
  }

  const metadata = cacheAssetFractionMetadata({
    chainId: input.chainId,
    fractionAddress: input.fractionAddress,
    trancheId: derived.trancheId,
    trancheNumber: derived.trancheNumber,
    assetVariant: derived.assetVariant,
    fractionName: toOptionalStringValue(nameResult),
    fractionSymbol: toOptionalStringValue(symbolResult),
    veNFT: veNFTResult ?? null,
    rewardAsset: rewardAssetResult ?? null,
    trancheDuration:
      trancheDurationResult == null ? null : toBigIntValue(trancheDurationResult),
    source: derived.source,
    deploymentBlock: fractionContract?.deploymentBlock ?? null,
  });

  await persistAssetFractionMetadata(metadata);

  return { status: "resolved", metadata };
}

function scalePricePerUnit(input: {
  amountFilled: bigint;
  grossTradeValue: bigint;
  assetDecimals: number;
  paymentTokenDecimals: number;
}): bigint {
  if (input.amountFilled === 0n) {
    return 0n;
  }

  const assetScale = 10n ** BigInt(input.assetDecimals);
  const paymentScale = 10n ** BigInt(input.paymentTokenDecimals);
  return (
    (input.grossTradeValue * assetScale * PRICE_SCALE) /
    input.amountFilled /
    paymentScale
  );
}

async function recordMarketplacePriceObservation(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"Marketplace", "OrdersMatched">,
  musdConfig: ReturnType<typeof getKnownMusdConfig>,
) {
  const namedArgs = event.namedArgs as Record<string, unknown>;
  const collection = readOptionalAddressValue(namedArgs, "collection");
  const paymentToken = readOptionalAddressValue(namedArgs, "paymentToken");
  const tokenId =
    readOptionalBigIntValue(namedArgs, "tokenId") ?? readOptionalBigIntValue(namedArgs, "listingId");
  const amountFilled =
    readOptionalBigIntValue(namedArgs, "amountFilled") ?? readOptionalBigIntValue(namedArgs, "amount");
  const grossTradeValue = readOptionalBigIntValue(namedArgs, "grossTradeValue");
  const assetFee = readOptionalBigIntValue(namedArgs, "assetFee") ?? 0n;
  const paymentFee = readOptionalBigIntValue(namedArgs, "paymentFee") ?? 0n;

  if (
    collection == null ||
    paymentToken == null ||
    tokenId == null ||
    amountFilled == null ||
    grossTradeValue == null
  ) {
    const reason = "missing_marketplace_price_observation_fields";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "marketplace.price_observation.skipped",
        reason,
        chainId: event.chainId,
        txHash: event.txHash,
        logIndex: event.logIndex,
        fingerprint: event.fingerprint,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      chainId: event.chainId,
      txHash: event.txHash,
      logIndex: event.logIndex,
      fingerprint: event.fingerprint,
    };
  }

  if (!musdConfig || paymentToken !== musdConfig.address) {
    const reason = "unsupported_payment_token";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "marketplace.price_observation.skipped",
        reason,
        chainId: event.chainId,
        paymentToken,
        expectedMusd: musdConfig?.address ?? null,
        txHash: event.txHash,
        logIndex: event.logIndex,
        fingerprint: event.fingerprint,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      chainId: event.chainId,
      paymentToken,
      expectedMusd: musdConfig?.address ?? null,
      txHash: event.txHash,
      logIndex: event.logIndex,
      fingerprint: event.fingerprint,
    };
  }

  const assetDecimals = await readDecimals(collection);
  const pricePerUnit = scalePricePerUnit({
    amountFilled,
    grossTradeValue,
    assetDecimals,
    paymentTokenDecimals: musdConfig.decimals,
  });
  const idempotencyKey = `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`;
  const blockTimestamp = new Date(event.blockTimestamp * 1000).toISOString();

  const rows = await db
    .insert(marketplacePriceObservations)
    .values({
      idempotencyKey,
      chainId: event.chainId,
      collection,
      tokenId: tokenId.toString(),
      paymentToken,
      assetDecimals,
      paymentTokenDecimals: musdConfig.decimals,
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      assetFee: assetFee.toString(),
      paymentFee: paymentFee.toString(),
      pricePerUnit: pricePerUnit.toString(),
      txHash: event.txHash.toLowerCase(),
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      blockTimestamp,
    })
    .onConflictDoNothing()
    .returning({
      id: marketplacePriceObservations.id,
    });

  if (rows.length === 0) {
    return {
      status: "skipped" as const,
      reason: "duplicate_price_observation",
      idempotencyKey,
      chainId: event.chainId,
      collection,
      paymentToken,
      tokenId: tokenId.toString(),
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      pricePerUnit: pricePerUnit.toString(),
    };
  }

  ctx.logger.info(
    stringifyJsonSafe({
      scope: "internal-events",
      event: "marketplace.price_observation.recorded",
      chainId: event.chainId,
      collection,
      paymentToken,
      tokenId: tokenId.toString(),
      amountFilled: amountFilled.toString(),
      grossTradeValue: grossTradeValue.toString(),
      pricePerUnit: pricePerUnit.toString(),
      txHash: event.txHash,
      logIndex: event.logIndex,
    }),
  );

  return {
    ok: true,
    inserted: true,
    idempotencyKey,
    observationId: rows[0]?.id ?? null,
    chainId: event.chainId,
    collection,
    paymentToken,
    tokenId: tokenId.toString(),
    amountFilled: amountFilled.toString(),
    grossTradeValue: grossTradeValue.toString(),
    pricePerUnit: pricePerUnit.toString(),
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockTimestamp,
  };
}

type MarketplaceTradeRoute = "buy_from_listing" | "sell_to_bid" | "matched_orders";

type MarketplaceObservationQuote = {
  method: "vwap" | "twap" | "spot" | "direct";
  windowMs: number;
  observationCount: number;
  pricePerUnit: bigint;
  windowStart: string;
  windowEnd: string;
};

type SerializedMarketplaceObservationQuote = Omit<MarketplaceObservationQuote, "pricePerUnit"> & {
  pricePerUnit: string;
};

type MarketplaceTradeRoleResolution = {
  route: MarketplaceTradeRoute;
  maker: Address;
  taker: Address;
};

type AcademyAwardRecordResult =
  | {
      status: "awarded";
      taskCode: string;
      idempotencyKey: string;
      programId: string;
      activityDefinitionId: string;
      entryId: string;
      pointsDelta: string | number | bigint;
    }
  | {
      status: "skipped";
      taskCode: string;
      reason: string;
    };

function scalePointUnits(input: { amount: bigint; amountDecimals: number; multiplier: bigint }): bigint {
  if (input.amount === 0n) {
    return 0n;
  }

  const amountScale = 10n ** BigInt(input.amountDecimals);
  return (input.amount * input.multiplier * ACADEMY_POINTS_SCALE) / amountScale;
}

function serializeMarketplaceObservationQuote(
  quote: MarketplaceObservationQuote,
): SerializedMarketplaceObservationQuote {
  return {
    ...quote,
    pricePerUnit: quote.pricePerUnit.toString(),
  };
}

function readOptionalBigIntValue(args: Record<string, unknown>, key: string): bigint | null {
  if (!(key in args)) {
    return null;
  }

  try {
    return toBigIntValue(args[key]);
  } catch {
    return null;
  }
}

function readOptionalAddressValue(args: Record<string, unknown>, key: string): Address | null {
  if (!(key in args)) {
    return null;
  }

  try {
    return toAddressValue(args[key]);
  } catch {
    return null;
  }
}

function readOptionalStringValue(args: Record<string, unknown>, key: string): string | null {
  if (!(key in args)) {
    return null;
  }

  return toOptionalStringValue(args[key]);
}

function resolveMarketplaceTradeRole(
  args: Record<string, unknown>,
): MarketplaceTradeRoleResolution | null {
  const seller = readOptionalAddressValue(args, "seller");
  const buyer = readOptionalAddressValue(args, "buyer");
  const listingId = readOptionalBigIntValue(args, "listingId");
  const bidId = readOptionalBigIntValue(args, "bidId");

  if (!seller || !buyer || listingId == null || bidId == null) {
    return null;
  }

  if (listingId === 0n && bidId > 0n) {
    return {
      route: "sell_to_bid",
      maker: buyer,
      taker: seller,
    };
  }

  if (bidId === 0n && listingId > 0n) {
    return {
      route: "buy_from_listing",
      maker: seller,
      taker: buyer,
    };
  }

  return {
    route: "matched_orders",
    maker: seller,
    taker: buyer,
  };
}

async function resolveMarketplaceObservationQuote(input: {
  chainId: number;
  collection: Address;
  tokenId: bigint;
  paymentToken: Address;
  windowEndTimestamp: number;
}): Promise<MarketplaceObservationQuote | null> {
  const rows = await db
    .select()
    .from(marketplacePriceObservations)
    .where(
      and(
        eq(marketplacePriceObservations.chainId, input.chainId),
        eq(marketplacePriceObservations.collection, input.collection),
        eq(marketplacePriceObservations.tokenId, input.tokenId.toString()),
        eq(marketplacePriceObservations.paymentToken, input.paymentToken),
        lte(
          marketplacePriceObservations.blockTimestamp,
          new Date(input.windowEndTimestamp * 1000).toISOString(),
        ),
      ),
    )
    .orderBy(
      desc(marketplacePriceObservations.blockTimestamp),
      desc(marketplacePriceObservations.blockNumber),
      desc(marketplacePriceObservations.logIndex),
    );

  if (rows.length === 0) {
    return null;
  }

  const newestRow = rows[0];
  if (!newestRow) {
    return null;
  }

  const newestTimestampMs = Date.parse(newestRow.blockTimestamp);
  if (Number.isNaN(newestTimestampMs)) {
    return null;
  }

  const windowStartTimestampMs = newestTimestampMs - MARKETPLACE_OBSERVATION_MAX_WINDOW_MS;
  const windowRows = rows.filter((row) => {
    const rowTimestampMs = Date.parse(row.blockTimestamp);
    return !Number.isNaN(rowTimestampMs) && rowTimestampMs >= windowStartTimestampMs;
  });

  if (windowRows.length === 0) {
    return null;
  }

  const oldestRow = windowRows[windowRows.length - 1];
  if (!oldestRow) {
    return null;
  }

  const observationCount = windowRows.length;
  const oldestTimestampMs = Date.parse(oldestRow.blockTimestamp);
  if (Number.isNaN(oldestTimestampMs)) {
    return null;
  }

  const sumAmountFilled = windowRows.reduce((accumulator, row) => accumulator + BigInt(row.amountFilled), 0n);
  const sumGrossTradeValue = windowRows.reduce((accumulator, row) => accumulator + BigInt(row.grossTradeValue), 0n);
  const sumPricePerUnit = windowRows.reduce((accumulator, row) => accumulator + BigInt(row.pricePerUnit), 0n);

  const method =
    observationCount >= 2 && sumAmountFilled > 0n
      ? "vwap"
      : observationCount >= 2
        ? "twap"
        : "spot";

  const pricePerUnit =
    method === "vwap"
      ? (sumGrossTradeValue * PRICE_SCALE) / sumAmountFilled
      : sumPricePerUnit / BigInt(observationCount);

  return {
    method,
    windowMs: newestTimestampMs - oldestTimestampMs,
    observationCount,
    pricePerUnit,
    windowStart: new Date(oldestTimestampMs).toISOString(),
    windowEnd: new Date(newestTimestampMs).toISOString(),
  };
}

async function awardAcademyTaskPoints(
  client: typeof db,
  input: {
    taskCode: string;
    chainId: number;
    userId: string;
    idempotencyKey: string;
    chainTimestampSeconds: number;
    pointsDelta: bigint;
    sourceReference: string;
    sourceDetails: Record<string, unknown>;
    sourceKind?: "manual" | "contract_event" | "system" | "import" | "adjustment";
  },
): Promise<AcademyAwardRecordResult> {
  const program = await resolveActiveAcademyProgram(client);
  if (!program) {
    return {
      status: "skipped",
      taskCode: input.taskCode,
      reason: "academy_program_not_configured",
    };
  }

  const task = await resolveAcademyTaskDefinition(client, program.id, input.taskCode);
  if (!task) {
    return {
      status: "skipped",
      taskCode: input.taskCode,
      reason: `academy_task_not_configured:${input.taskCode}`,
    };
  }

  if (!isAcademyProgramActiveAt(program, input.chainTimestampSeconds)) {
    return {
      status: "skipped",
      taskCode: input.taskCode,
      reason: "academy_season_out_of_window",
    };
  }

  const entry = await recordAcademyTaskPoints(client, {
    program,
    activityDefinitionId: task.activityDefinition.id,
    userId: input.userId,
    chainId: input.chainId,
    idempotencyKey: input.idempotencyKey,
    chainTimestampSeconds: input.chainTimestampSeconds,
    pointsDelta: input.pointsDelta,
    sourceReference: input.sourceReference,
    sourceDetails: {
      ...input.sourceDetails,
      taskCode: input.taskCode,
    },
    sourceKind: input.sourceKind ?? "contract_event",
  });

  return {
    status: "awarded",
    taskCode: input.taskCode,
    idempotencyKey: input.idempotencyKey,
    programId: program.id,
    activityDefinitionId: task.activityDefinition.id,
    entryId: entry.id,
    pointsDelta: input.pointsDelta,
  };
}

async function handleAssetFractionDeployed(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"AssetLedger", "AssetFractionDeployed">,
) {
  const namedArgs = event.namedArgs as Record<string, unknown>;
  const fractionAddress = readOptionalAddressValue(namedArgs, "assetFraction");
  const trancheIdValue = readOptionalBigIntValue(namedArgs, "trancheId");
  const fractionName = readOptionalStringValue(namedArgs, "fractionName");

  if (!fractionAddress || trancheIdValue == null) {
    const reason = "fraction_metadata_missing";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_deployed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const trancheId = trancheIdValue;
  const assetVariant = decodeAssetFractionVariant(trancheId);
  if (!assetVariant) {
    const reason = "fraction_asset_variant_unknown";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_deployed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fractionAddress,
        trancheId: trancheId.toString(),
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const metadata = cacheAssetFractionMetadata({
    chainId: event.chainId,
    fractionAddress,
    trancheId,
    trancheNumber: Number(trancheId & 0xffffn),
    assetVariant,
    fractionName,
    fractionSymbol: `av${assetVariant === "veBTC" ? "BTC" : "MEZO"}w${String(Number(trancheId & 0xffffn))}`,
    veNFT: null,
    rewardAsset: null,
    trancheDuration: null,
    source: "deployment_event",
    deploymentBlock: event.blockNumber,
  });

  await persistAssetFractionMetadata(metadata);

  ctx.logger.info(
    stringifyJsonSafe({
      scope: "internal-events",
      event: "academy.asset_fraction_deployed.registered",
      fingerprint: event.fingerprint,
      chainId: event.chainId,
      fractionAddress: metadata.fractionAddress,
      trancheId: metadata.trancheId.toString(),
      trancheNumber: metadata.trancheNumber,
      assetVariant: metadata.assetVariant,
      fractionName: metadata.fractionName,
      txHash: event.txHash,
      logIndex: event.logIndex,
    }),
  );

  return {
    status: "processed" as const,
    fingerprint: event.fingerprint,
    fractionAddress: metadata.fractionAddress,
    trancheId: metadata.trancheId.toString(),
    assetVariant: metadata.assetVariant,
  };
}

async function handleMarketplaceOrdersMatched(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"Marketplace", "OrdersMatched">,
) {
  const musdConfig = getKnownMusdConfig(event.chainId);
  const observation = await recordMarketplacePriceObservation(ctx, event, musdConfig);
  const namedArgs = event.namedArgs;
  const route = resolveMarketplaceTradeRole(namedArgs);
  const collection = readOptionalAddressValue(namedArgs, "collection");
  const paymentToken = readOptionalAddressValue(namedArgs, "paymentToken");
  const grossTradeValue = readOptionalBigIntValue(namedArgs, "grossTradeValue");
  const amount = readOptionalBigIntValue(namedArgs, "amountFilled") ?? readOptionalBigIntValue(namedArgs, "amount");
  const listingId = readOptionalBigIntValue(namedArgs, "listingId");
  const bidId = readOptionalBigIntValue(namedArgs, "bidId");

  if (
    !route ||
    collection == null ||
    paymentToken == null ||
    grossTradeValue == null ||
    amount == null ||
    listingId == null ||
    bidId == null
  ) {
    const reason = "missing_marketplace_trade_metadata";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.marketplace_orders_matched.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      observation,
      pointsAwards: [
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
      ],
      fingerprint: event.fingerprint,
    };
  }

  if (observation.status === "skipped" && observation.reason === "unsupported_payment_token") {
    return {
      observation,
      pointsAwards: [
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          status: "skipped" as const,
          reason: "unsupported_payment_token",
        },
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          status: "skipped" as const,
          reason: "unsupported_payment_token",
        },
      ],
      fingerprint: event.fingerprint,
    };
  }

  const [makerUser, takerUser] = await Promise.all([
    resolveAcademyUserByWalletAddress(route.maker),
    resolveAcademyUserByWalletAddress(route.taker),
  ]);

  const totalPointsUnits = scalePointUnits({
    amount: grossTradeValue,
    amountDecimals: musdConfig?.decimals ?? 18,
    multiplier: 5n,
  });
  if (totalPointsUnits === 0n) {
    const reason = "trade_award_rounds_to_zero";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.marketplace_orders_matched.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        grossTradeValue: grossTradeValue.toString(),
        paymentToken,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      observation,
      pointsAwards: [
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
      ],
      fingerprint: event.fingerprint,
    };
  }

  const halfPointsUnits = totalPointsUnits / 2n;
  if (halfPointsUnits === 0n) {
    const reason = "trade_award_rounds_to_zero";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.marketplace_orders_matched.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        grossTradeValue: grossTradeValue.toString(),
        paymentToken,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      observation,
      pointsAwards: [
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
        {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          status: "skipped" as const,
          reason,
        },
      ],
      fingerprint: event.fingerprint,
    };
  }

  const sourceBaseReference = `${event.fingerprint}:marketplace:orders-matched`;
  const sourceDetails = {
    eventFingerprint: event.fingerprint,
    eventName: event.eventName,
    contractAddress: event.contractAddress,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    route: route.route,
    makerAddress: route.maker,
    takerAddress: route.taker,
    listingId: listingId.toString(),
    bidId: bidId.toString(),
    amount: amount.toString(),
      grossTradeValue: grossTradeValue.toString(),
      paymentToken,
      paymentTokenDecimals: musdConfig?.decimals ?? 18,
      pointsMultiplier: 5,
      totalPointsUnits: totalPointsUnits.toString(),
    makerPointsUnits: halfPointsUnits.toString(),
    takerPointsUnits: halfPointsUnits.toString(),
    observation,
  };

  return db.transaction(async (client) => {
    const makerAward = makerUser
      ? await awardAcademyTaskPoints(client, {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          chainId: event.chainId,
          userId: makerUser.id,
          idempotencyKey: `${event.fingerprint}:marketplace:orders-matched:maker`,
          chainTimestampSeconds: event.blockTimestamp,
          pointsDelta: halfPointsUnits,
          sourceReference: `${sourceBaseReference}:maker`,
          sourceDetails: {
            ...sourceDetails,
            role: "maker",
            makerUserId: makerUser.id,
            makerAddress: route.maker,
          },
          sourceKind: "contract_event",
        })
      : {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
          status: "skipped" as const,
          reason: "academy_user_missing",
        };

    if (!makerUser) {
      ctx.logger.info(
        stringifyJsonSafe({
          scope: "internal-events",
          event: "academy.marketplace_orders_matched.skipped",
          reason: "academy_user_missing",
          missingRole: "maker",
          fingerprint: event.fingerprint,
          chainId: event.chainId,
          makerAddress: route.maker,
          txHash: event.txHash,
          logIndex: event.logIndex,
        }),
      );
    }

    const takerAward = takerUser
      ? await awardAcademyTaskPoints(client, {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          chainId: event.chainId,
          userId: takerUser.id,
          idempotencyKey: `${event.fingerprint}:marketplace:orders-matched:taker`,
          chainTimestampSeconds: event.blockTimestamp,
          pointsDelta: halfPointsUnits,
          sourceReference: `${sourceBaseReference}:taker`,
          sourceDetails: {
            ...sourceDetails,
            role: "taker",
            takerUserId: takerUser.id,
            takerAddress: route.taker,
          },
          sourceKind: "contract_event",
        })
      : {
          taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
          status: "skipped" as const,
          reason: "academy_user_missing",
        };

    if (!takerUser) {
      ctx.logger.info(
        stringifyJsonSafe({
          scope: "internal-events",
          event: "academy.marketplace_orders_matched.skipped",
          reason: "academy_user_missing",
          missingRole: "taker",
          fingerprint: event.fingerprint,
          chainId: event.chainId,
          takerAddress: route.taker,
          txHash: event.txHash,
          logIndex: event.logIndex,
        }),
      );
    }

    return {
      observation,
      pointsAwards: [makerAward, takerAward],
      fingerprint: event.fingerprint,
      market: {
        collection,
        paymentToken,
        grossTradeValue: grossTradeValue.toString(),
        amount: amount.toString(),
      },
    };
  });
}

async function handleAssetFractionRewardsClaimed(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"AssetLedger", "AssetFractionRewardsClaimed">,
) {
  const namedArgs = event.namedArgs as Record<string, unknown>;
  const fraction = readOptionalAddressValue(namedArgs, "fraction");
  const account = readOptionalAddressValue(namedArgs, "account");
  const recipient = readOptionalAddressValue(namedArgs, "recipient") ?? account;
  const amount = readOptionalBigIntValue(namedArgs, "amount");

  if (!fraction || !recipient || amount == null) {
    const reason = "missing_reward_claim_metadata";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const metadataResult = await resolveAssetFractionMetadata({
    chainId: event.chainId,
    ledgerAddress: toAddressValue(event.contractAddress),
    fractionAddress: fraction,
    blockNumber: event.blockNumber,
  });
  if (metadataResult.status === "skipped") {
    const reason = metadataResult.reason;
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const metadata = metadataResult.metadata;
  const musdConfig = getKnownMusdConfig(event.chainId);
  const rewardAsset = metadata.rewardAsset;
  const rewardAssetDecimals = rewardAsset ? await readDecimals(rewardAsset) : null;
  const musdDecimals = musdConfig?.decimals ?? 18;

  let quote: MarketplaceObservationQuote | null = null;
  if (musdConfig && rewardAsset === musdConfig.address) {
    quote = {
      method: "direct",
      windowMs: 0,
      observationCount: 0,
      pricePerUnit: PRICE_SCALE,
      windowStart: new Date(event.blockTimestamp * 1000).toISOString(),
      windowEnd: new Date(event.blockTimestamp * 1000).toISOString(),
    };
  } else if (musdConfig && metadata.assetVariant) {
    quote = await resolveMarketplaceObservationQuote({
      chainId: event.chainId,
      collection: toAddressValue(event.contractAddress),
      tokenId: metadata.trancheId,
      paymentToken: musdConfig.address,
      windowEndTimestamp: event.blockTimestamp,
    });
  } else if (!metadata.assetVariant) {
    const reason = "fraction_asset_variant_unknown";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  if (!quote) {
    const reason = "price_observation_missing";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        rewardAsset,
        assetVariant: metadata.assetVariant,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const rewardValueMUsdUnits = (amount * quote.pricePerUnit) / PRICE_SCALE;
  const pointsUnits = scalePointUnits({
    amount: rewardValueMUsdUnits,
    amountDecimals: musdDecimals,
    multiplier: 50n,
  });
  if (pointsUnits === 0n) {
    const reason = "reward_award_rounds_to_zero";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        rewardAsset,
        rewardValueMUsdUnits: rewardValueMUsdUnits.toString(),
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  const pointsDelta = formatAcademyReferralPoints(pointsUnits);
  const sourceBaseReference = `${event.fingerprint}:asset-ledger:reward-claimed`;
  const sourceDetails = {
    eventFingerprint: event.fingerprint,
    eventName: event.eventName,
    contractAddress: event.contractAddress,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    account,
    recipient,
    fraction,
    fractionName: metadata.fractionName,
    fractionSymbol: metadata.fractionSymbol,
    trancheId: metadata.trancheId.toString(),
    trancheNumber: metadata.trancheNumber,
    assetVariant: metadata.assetVariant,
    rewardAsset,
    rewardAssetDecimals,
    rewardAmount: amount.toString(),
    rewardValueMUsdUnits: rewardValueMUsdUnits.toString(),
    rewardValueMUsdDecimals: musdDecimals,
    pointsMultiplier: 50,
    pointsUnits: pointsUnits.toString(),
    priceObservationMethod: quote.method,
    priceObservationWindowMs: quote.windowMs,
    priceObservationWindowStart: quote.windowStart,
    priceObservationWindowEnd: quote.windowEnd,
    priceObservationCount: quote.observationCount,
    pricePerUnit: quote.pricePerUnit.toString(),
  };

  const recipientUser = await resolveAcademyUserByWalletAddress(recipient);
  if (!recipientUser) {
    const reason = "recipient_user_missing";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        recipient,
        txHash: event.txHash,
        logIndex: event.logIndex,
      }),
    );

    return {
      status: "skipped" as const,
      reason,
      fingerprint: event.fingerprint,
    };
  }

  return db.transaction(async (client) => {
    const award = await awardAcademyTaskPoints(client, {
      taskCode: ACADEMY_ASSET_FRACTION_REWARDS_CLAIMED_TASK_CODE,
      chainId: event.chainId,
      userId: recipientUser.id,
      idempotencyKey: `${event.fingerprint}:asset-ledger:reward-claimed`,
      chainTimestampSeconds: event.blockTimestamp,
      pointsDelta: pointsUnits,
      sourceReference: sourceBaseReference,
      sourceDetails,
      sourceKind: "contract_event",
    });

    return {
      award,
      fingerprint: event.fingerprint,
      fraction,
      rewardAsset,
      trancheId: metadata.trancheId.toString(),
      assetVariant: metadata.assetVariant,
      rewardAmount: amount.toString(),
      rewardValueMUsdUnits: rewardValueMUsdUnits.toString(),
      pointsDelta,
      priceObservation: serializeMarketplaceObservationQuote(quote),
    };
  });
}

const contractEventHandlers = new Map<string, AnyContractEventHandler>();

registerContractEventHandler({
  key: buildHandlerKeyTyped("Marketplace", "OrdersMatched"),
  description: "Record marketplace execution prices and award Academy points for matched orders.",
  contractName: "Marketplace",
  eventName: "OrdersMatched",
  run: handleMarketplaceOrdersMatched,
});

registerContractEventHandler({
  key: buildHandlerKeyTyped("AssetLedger", "AssetFractionDeployed"),
  description: "Register dynamically deployed asset fractions in the runtime contract registry.",
  contractName: "AssetLedger",
  eventName: "AssetFractionDeployed",
  run: handleAssetFractionDeployed,
});

registerContractEventHandler({
  key: buildHandlerKeyTyped("AssetLedger", "AssetFractionRewardsClaimed"),
  description: "Award Academy points from asset fraction reward claims.",
  contractName: "AssetLedger",
  eventName: "AssetFractionRewardsClaimed",
  run: handleAssetFractionRewardsClaimed,
});

export function registerContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(handler: ContractEventHandlerDefinition<TContractName, TEventName>): ContractEventHandlerDefinition<TContractName, TEventName> {
  contractEventHandlers.set(handler.key, handler as unknown as AnyContractEventHandler);
  return handler;
}

export function getContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(
  contractName: TContractName,
  eventName: TEventName,
): ContractEventHandlerDefinition<TContractName, TEventName> | null;
export function getContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler | null;
export function getContractEventHandler(contractName: ContractName, eventName: string): AnyContractEventHandler | null {
  return contractEventHandlers.get(`${contractName}.${eventName}`) ?? null;
}

export function countRegisteredContractEventHandlers(): number {
  return contractEventHandlers.size;
}
