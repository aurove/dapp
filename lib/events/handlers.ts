import "server-only";

import { and, eq } from "drizzle-orm";
import { getAddress, http, createPublicClient, type Abi, type Address, type PublicClient } from "viem";

import {
  ACADEMY_ASSET_FRACTION_REWARDS_CLAIMED_TASK_CODE,
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
import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";

import { getRegisteredContract, getRegisteredContractAbi, registerRuntimeContract } from "./contracts";
import { stringifyJsonSafe } from "./json-safe";
import type {
  AnyContractEventHandler,
  ContractEventHandlerContext,
  ContractEventHandlerDefinition,
  AnyContractEvent,
} from "./types";
import type {
  ContractEventNameForContract,
  ContractName,
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

let eventContractClient: PublicClient | null = null;
let eventContractRpcUrl: string | null = null;
const assetFractionMetadataCache = new Map<string, AssetFractionMetadata>();

function getEventContractRpcUrl(): string {
  const configured =
    process.env.EVENTS_RELAY_RPC_URL?.trim() ||
    process.env.RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_RPC_URL?.trim();

  return configured && configured.length > 0 ? configured : "http://127.0.0.1:8545";
}

function getEventContractClient(): PublicClient {
  const rpcUrl = getEventContractRpcUrl();
  if (!eventContractClient || eventContractRpcUrl !== rpcUrl) {
    eventContractClient = createPublicClient({
      transport: http(rpcUrl, { timeout: 15_000 }),
    });
    eventContractRpcUrl = rpcUrl;
  }

  return eventContractClient;
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
    const result = await getEventContractClient().readContract({
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
  return getRegisteredContractAbi("Ledger") as Abi | null;
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
    const result = await getEventContractClient().readContract({
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
      contractName: "Ledger",
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
  event: AnyContractEvent,
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

async function handleAssetFractionRewardsClaimed(
  ctx: ContractEventHandlerContext,
  event: AnyContractEvent,
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

  if (!musdConfig || rewardAsset !== musdConfig.address) {
    const reason = "unsupported_reward_asset";
    ctx.logger.info(
      stringifyJsonSafe({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        fraction,
        rewardAsset,
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

  const rewardValueMUsdUnits = amount;
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
    valuationMethod: "direct_musd",
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
    };
  });
}

const contractEventHandlers = new Map<string, AnyContractEventHandler>();

registerContractEventHandler({
  key: buildHandlerKeyTyped("Ledger" as never, "AssetFractionDeployed" as never),
  description: "Register dynamically deployed asset fractions in the runtime contract registry.",
  contractName: "Ledger" as never,
  eventName: "AssetFractionDeployed" as never,
  run: handleAssetFractionDeployed,
});

registerContractEventHandler({
  key: buildHandlerKeyTyped("Ledger" as never, "AssetFractionRewardsClaimed" as never),
  description: "Award Academy points from asset fraction reward claims.",
  contractName: "Ledger" as never,
  eventName: "AssetFractionRewardsClaimed" as never,
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
