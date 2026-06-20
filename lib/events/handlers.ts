import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getAddress, http, createPublicClient, type Address, type PublicClient } from "viem";

import {
  ACADEMY_ASSET_FRACTION_REWARDS_CLAIMED_TASK_CODE,
  ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
  ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
  ACADEMY_POINTS_SCALE,
} from "@/lib/academy/constants";
import { formatAcademyReferralPoints } from "@/lib/academy/referrals";
import {
  recordAcademyTaskPoints,
  resolveActiveAcademyProgram,
  resolveAcademyTaskDefinition,
} from "@/lib/academy/tasks/points";
import { db } from "@/lib/db";
import { marketplacePriceObservations } from "@/lib/db/marketplace-schema";
import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";

import { getRegisteredContract } from "./contracts";
import type {
  AnyContractEventHandler,
  ContractEventHandlerContext,
  ContractEventHandlerDefinition,
  RegisteredContract,
} from "./types";
import type {
  ContractEventNameForContract,
  ContractName,
  DecodedContractEvent,
} from "@/contracts/event-types";

export { buildHandlerKeyTyped as buildHandlerKey };

const shouldLogInternalEvents = (() => {
  const value = process.env.LOG_EVENTS;
  return value == null || value.toLowerCase() === "true";
})();

function logEventHandler(event: string, details: Record<string, unknown>) {
  if (shouldLogInternalEvents) {
    console.info(JSON.stringify({ scope: "internal-events", event, ...details }));
  }
}

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

let marketplaceObservationClient: PublicClient | null = null;
let marketplaceObservationRpcUrl: string | null = null;

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
      JSON.stringify({
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

  const assetDecimals = await readDecimals(collection);
  const paymentTokenDecimals = await readDecimals(paymentToken);
  const pricePerUnit = scalePricePerUnit({
    amountFilled,
    grossTradeValue,
    assetDecimals,
    paymentTokenDecimals,
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
      paymentTokenDecimals,
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
    JSON.stringify({
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

const KNOWN_MUSD_ADDRESS_BY_CHAIN: Record<number, string> = {
  31337: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  31611: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  31612: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
};

const MARKETPLACE_OBSERVATION_WINDOWS_MS = [
  30 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  60 * 60 * 1000,
] as const;

type MarketplaceTradeRoute = "buy_from_listing" | "sell_to_bid" | "matched_orders";

type MarketplaceObservationQuote = {
  method: "vwap" | "twap" | "spot" | "direct";
  windowMs: number;
  observationCount: number;
  pricePerUnit: bigint;
  windowStart: string;
  windowEnd: string;
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

function resolveKnownMusdAddress(chainId: number): Address | null {
  const address = KNOWN_MUSD_ADDRESS_BY_CHAIN[chainId];
  return address ? getAddress(address) : null;
}

function scalePointUnits(input: { amount: bigint; amountDecimals: number; multiplier: bigint }): bigint {
  if (input.amount === 0n) {
    return 0n;
  }

  const amountScale = 10n ** BigInt(input.amountDecimals);
  return (input.amount * input.multiplier * BigInt(ACADEMY_POINTS_SCALE)) / amountScale;
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
  paymentToken: Address;
  windowEndTimestamp: number;
}): Promise<MarketplaceObservationQuote | null> {
  const candidates: Array<MarketplaceObservationQuote & { reliabilityRank: number }> = [];
  const windowEnd = new Date(input.windowEndTimestamp * 1000);

  for (const windowMs of MARKETPLACE_OBSERVATION_WINDOWS_MS) {
    const windowStart = new Date(windowEnd.getTime() - windowMs);
    const rows = await db
      .select()
      .from(marketplacePriceObservations)
      .where(
        and(
          eq(marketplacePriceObservations.chainId, input.chainId),
          eq(marketplacePriceObservations.collection, input.collection),
          eq(marketplacePriceObservations.paymentToken, input.paymentToken),
          gte(marketplacePriceObservations.blockTimestamp, windowStart.toISOString()),
          lte(marketplacePriceObservations.blockTimestamp, windowEnd.toISOString()),
        ),
      )
      .orderBy(
        desc(marketplacePriceObservations.blockTimestamp),
        desc(marketplacePriceObservations.blockNumber),
        desc(marketplacePriceObservations.logIndex),
      );

    if (rows.length === 0) {
      continue;
    }

    const observationCount = rows.length;
    const sumAmountFilled = rows.reduce((accumulator, row) => accumulator + BigInt(row.amountFilled), 0n);
    const sumGrossTradeValue = rows.reduce((accumulator, row) => accumulator + BigInt(row.grossTradeValue), 0n);
    const sumPricePerUnit = rows.reduce((accumulator, row) => accumulator + BigInt(row.pricePerUnit), 0n);

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

    candidates.push({
      method,
      windowMs,
      observationCount,
      pricePerUnit,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      reliabilityRank: method === "vwap" ? 2 : method === "twap" ? 1 : 0,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.reliabilityRank !== left.reliabilityRank) {
      return right.reliabilityRank - left.reliabilityRank;
    }

    return right.windowMs - left.windowMs;
  });

  const best = candidates[0];
  if (!best) {
    return null;
  }

  return {
    method: best.method,
    windowMs: best.windowMs,
    observationCount: best.observationCount,
    pricePerUnit: best.pricePerUnit,
    windowStart: best.windowStart,
    windowEnd: best.windowEnd,
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
    pointsDelta: number | string | bigint;
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

  const entry = await recordAcademyTaskPoints(client, {
    programId: program.id,
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

async function readFractionRewardAsset(input: {
  chainId: number;
  fraction: Address;
  fallbackContract: RegisteredContract;
  blockNumber: number;
}): Promise<Address> {
  const fractionContract = getRegisteredContract(input.chainId, input.fraction);
  const contractsToTry =
    fractionContract && getAddress(fractionContract.address) !== getAddress(input.fallbackContract.address)
      ? [fractionContract, input.fallbackContract]
      : [fractionContract ?? input.fallbackContract];

  let lastError: unknown = null;
  for (const contract of contractsToTry) {
    try {
      const result = await getMarketplaceObservationClient().readContract({
        address: contract.address as Address,
        abi: contract.abi,
        functionName: "rewardAsset",
        blockNumber: BigInt(input.blockNumber),
      });

      return toAddressValue(result);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Unable to read reward asset.");
}

async function handleMarketplaceOrdersMatched(
  ctx: ContractEventHandlerContext,
  event: DecodedContractEvent<"Marketplace", "OrdersMatched">,
) {
  const observation = await recordMarketplacePriceObservation(ctx, event);
  const namedArgs = event.namedArgs as Record<string, unknown>;
  const route = resolveMarketplaceTradeRole(namedArgs);
  const collection = readOptionalAddressValue(namedArgs, "collection");
  const paymentToken = readOptionalAddressValue(namedArgs, "paymentToken");
  const grossTradeValue = readOptionalBigIntValue(namedArgs, "grossTradeValue");
  const amount = readOptionalBigIntValue(namedArgs, "amountFilled") ?? readOptionalBigIntValue(namedArgs, "amount");
  const listingId = readOptionalBigIntValue(namedArgs, "listingId");
  const bidId = readOptionalBigIntValue(namedArgs, "bidId");
  const knownMusdAddress = resolveKnownMusdAddress(event.chainId);

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
      JSON.stringify({
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

  if (!knownMusdAddress || paymentToken !== knownMusdAddress) {
    const reason = "non_musd_settlement";
    ctx.logger.info(
      JSON.stringify({
        scope: "internal-events",
        event: "academy.marketplace_orders_matched.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        paymentToken,
        knownMusdAddress,
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

  const paymentTokenDecimals = await readDecimals(paymentToken);
  const totalPointsUnits = scalePointUnits({
    amount: grossTradeValue,
    amountDecimals: paymentTokenDecimals,
    multiplier: 5n,
  });
  if (totalPointsUnits === 0n) {
    const reason = "trade_award_rounds_to_zero";
    ctx.logger.info(
      JSON.stringify({
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
      JSON.stringify({
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

  const halfPoints = formatAcademyReferralPoints(halfPointsUnits);
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
    paymentTokenDecimals,
    pointsMultiplier: 5,
    totalPointsUnits: totalPointsUnits.toString(),
    makerPointsUnits: halfPointsUnits.toString(),
    takerPointsUnits: halfPointsUnits.toString(),
    observation,
  };

  return db.transaction(async (client) => {
    const makerAward = await awardAcademyTaskPoints(client, {
      taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_MAKER_TASK_CODE,
      chainId: event.chainId,
      userId: route.maker,
      idempotencyKey: `${event.fingerprint}:marketplace:orders-matched:maker`,
      chainTimestampSeconds: event.blockTimestamp,
      pointsDelta: halfPoints,
      sourceReference: `${sourceBaseReference}:maker`,
      sourceDetails: {
        ...sourceDetails,
        role: "maker",
      },
      sourceKind: "contract_event",
    });

    const takerAward = await awardAcademyTaskPoints(client, {
      taskCode: ACADEMY_MARKETPLACE_ORDER_MATCHED_TAKER_TASK_CODE,
      chainId: event.chainId,
      userId: route.taker,
      idempotencyKey: `${event.fingerprint}:marketplace:orders-matched:taker`,
      chainTimestampSeconds: event.blockTimestamp,
      pointsDelta: halfPoints,
      sourceReference: `${sourceBaseReference}:taker`,
      sourceDetails: {
        ...sourceDetails,
        role: "taker",
      },
      sourceKind: "contract_event",
    });

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
      JSON.stringify({
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

  const fallbackContract = getRegisteredContract(event.chainId, event.contractAddress);
  if (!fallbackContract) {
    const reason = "unregistered_reward_contract";
    ctx.logger.info(
      JSON.stringify({
        scope: "internal-events",
        event: "academy.asset_fraction_rewards_claimed.skipped",
        reason,
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        contractAddress: event.contractAddress,
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

  let rewardAsset: Address;
  try {
    rewardAsset = await readFractionRewardAsset({
      chainId: event.chainId,
      fraction,
      fallbackContract,
      blockNumber: event.blockNumber,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unable_to_read_reward_asset";
    ctx.logger.warn(
      JSON.stringify({
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

  const musdAddress = resolveKnownMusdAddress(event.chainId);
  const rewardAssetDecimals = await readDecimals(rewardAsset);
  const musdDecimals = musdAddress ? await readDecimals(musdAddress) : 18;

  let quote: MarketplaceObservationQuote | null = null;
  if (musdAddress && rewardAsset === musdAddress) {
    quote = {
      method: "direct",
      windowMs: 0,
      observationCount: 0,
      pricePerUnit: PRICE_SCALE,
      windowStart: new Date(event.blockTimestamp * 1000).toISOString(),
      windowEnd: new Date(event.blockTimestamp * 1000).toISOString(),
    };
  } else if (musdAddress) {
    quote = await resolveMarketplaceObservationQuote({
      chainId: event.chainId,
      collection: fraction,
      paymentToken: musdAddress,
      windowEndTimestamp: event.blockTimestamp,
    });
  }

  if (!quote) {
    const reason = "no_valid_price_observation";
    ctx.logger.info(
      JSON.stringify({
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

  const rewardValueMUsdUnits = (amount * quote.pricePerUnit) / PRICE_SCALE;
  const pointsUnits = scalePointUnits({
    amount: rewardValueMUsdUnits,
    amountDecimals: musdDecimals,
    multiplier: 50n,
  });
  if (pointsUnits === 0n) {
    const reason = "reward_award_rounds_to_zero";
    ctx.logger.info(
      JSON.stringify({
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

  return db.transaction(async (client) => {
    const award = await awardAcademyTaskPoints(client, {
      taskCode: ACADEMY_ASSET_FRACTION_REWARDS_CLAIMED_TASK_CODE,
      chainId: event.chainId,
      userId: recipient,
      idempotencyKey: `${event.fingerprint}:asset-ledger:reward-claimed`,
      chainTimestampSeconds: event.blockTimestamp,
      pointsDelta,
      sourceReference: sourceBaseReference,
      sourceDetails,
      sourceKind: "contract_event",
    });

    return {
      award,
      fingerprint: event.fingerprint,
      fraction,
      rewardAsset,
      rewardAmount: amount.toString(),
      rewardValueMUsdUnits: rewardValueMUsdUnits.toString(),
      pointsDelta,
      priceObservation: quote,
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
