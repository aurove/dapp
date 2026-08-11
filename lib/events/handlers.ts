import "server-only";

import { getAddress, type Address } from "viem";

import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";
import type { ContractEventNameForContract, ContractName } from "@/contracts/event-types";
import {
  ACADEMY_LP_FEES_COLLECTED_TASK_CODE,
  ACADEMY_LP_POINTS_DENOMINATOR,
  ACADEMY_LP_POINTS_NUMERATOR,
  ACADEMY_QUALIFYING_SWAP_TASK_CODE,
  ACADEMY_SWAPPER_POINTS_DENOMINATOR,
  ACADEMY_SWAPPER_POINTS_NUMERATOR,
  ACADEMY_TASK_USER_PERCENT,
} from "@/lib/academy/constants";
import {
  formatAcademyReferralPoints,
  resolveAcademyUserByWalletAddress,
} from "@/lib/academy/referrals";
import {
  isAcademyProgramActiveAt,
  recordAcademyTaskPoints,
  resolveAcademyTaskDefinition,
  resolveActiveAcademyProgram,
} from "@/lib/academy/tasks/points";
import { getAuroveSupportedPool } from "@/lib/config/supported-liquidity-pools";
import { getKnownMusdConfig } from "@/lib/config/musd";
import { db } from "@/lib/db";
import { getPortfolioRegistry } from "@/features/portfolio/registry";

import { stringifyJsonSafe } from "./json-safe";
import type {
  AnyContractEvent,
  AnyContractEventHandler,
  ContractEventHandlerContext,
  ContractEventHandlerDefinition,
} from "./types";

export { buildHandlerKeyTyped as buildHandlerKey };

const Q192 = 2n ** 192n;
const MIN_TRUSTED_POOL_TICK = -887_000;
const MAX_TRUSTED_POOL_TICK = 887_000;
const DEFAULT_MAX_ACADEMY_VALUATION_MUSD = 1_000_000n;

type Fraction = { numerator: bigint; denominator: bigint };
type PoolState = {
  address: Address;
  token0: Address;
  token1: Address;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
};

type AwardResult =
  | { status: "awarded"; taskCode: string; entryId: string; pointsDelta: string }
  | { status: "skipped"; taskCode: string; reason: string };

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string") return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function multiplyFraction(value: Fraction, numerator: bigint, denominator: bigint): Fraction {
  return {
    numerator: value.numerator * numerator,
    denominator: value.denominator * denominator,
  };
}

function fractionToPointUnits(
  valueInMusdRaw: Fraction,
  numerator: bigint,
  denominator: bigint,
): bigint {
  // MUSD and Academy point units both use 18 decimals. This is the sole valuation/points
  // rounding boundary before the numeric(78,18) ledger write.
  return (valueInMusdRaw.numerator * numerator) / (valueInMusdRaw.denominator * denominator);
}

function maxAcademyValuationRaw(decimals: number): bigint {
  const configured = process.env.ACADEMY_MAX_VALUATION_MUSD?.trim();
  const wholeMusd =
    configured && /^\d+$/.test(configured)
      ? BigInt(configured)
      : DEFAULT_MAX_ACADEMY_VALUATION_MUSD;
  return wholeMusd * 10n ** BigInt(decimals);
}

function isAcademyValuationWithinBounds(value: Fraction, musdDecimals: number): boolean {
  if (value.numerator <= 0n || value.denominator <= 0n) return false;
  return value.numerator <= maxAcademyValuationRaw(musdDecimals) * value.denominator;
}

function grossReferralBaseForExactUserPoints(userPoints: bigint): bigint {
  if (userPoints <= 0n) return 0n;
  const percent = BigInt(ACADEMY_TASK_USER_PERCENT);
  // recordAcademyTaskPoints retains the existing 90/3/7 referral calculation. Supply
  // the gross base whose 90% user share is the activity reward defined by this model.
  return (userPoints * 100n + percent - 51n) / percent;
}

function getRelayedPoolStates(event: AnyContractEvent): PoolState[] {
  return (event.raw.valuationPools ?? []).flatMap((pool) => {
    const sqrtPriceX96 = BigInt(pool.sqrtPriceX96);
    const liquidity = BigInt(pool.liquidity);
    const trusted =
      sqrtPriceX96 > 0n &&
      pool.tick > MIN_TRUSTED_POOL_TICK &&
      pool.tick < MAX_TRUSTED_POOL_TICK &&
      liquidity > 0n;
    return trusted
      ? [
          {
            ...pool,
            address: getAddress(pool.address),
            token0: getAddress(pool.token0),
            token1: getAddress(pool.token1),
            sqrtPriceX96,
            liquidity,
          },
        ]
      : [];
  });
}

function valueTokenInMusdRaw(input: {
  token: Address;
  amount: bigint;
  musd: Address;
  pools: PoolState[];
}): Fraction | null {
  const target = input.musd.toLowerCase();
  const queue: Array<{ token: Address; value: Fraction; visited: Set<string> }> = [
    { token: input.token, value: { numerator: input.amount, denominator: 1n }, visited: new Set() },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.token.toLowerCase() === target) return current.value;

    for (const pool of input.pools) {
      const poolKey = pool.address.toLowerCase();
      if (current.visited.has(poolKey)) continue;
      const squaredPrice = pool.sqrtPriceX96 * pool.sqrtPriceX96;
      let nextToken: Address | null = null;
      let nextValue: Fraction | null = null;
      if (pool.token0.toLowerCase() === current.token.toLowerCase()) {
        nextToken = pool.token1;
        nextValue = multiplyFraction(current.value, squaredPrice, Q192);
      } else if (pool.token1.toLowerCase() === current.token.toLowerCase()) {
        nextToken = pool.token0;
        nextValue = multiplyFraction(current.value, Q192, squaredPrice);
      }
      if (nextToken && nextValue) {
        queue.push({
          token: nextToken,
          value: nextValue,
          visited: new Set([...current.visited, poolKey]),
        });
      }
    }
  }

  return null;
}

async function awardActivity(input: {
  taskCode: string;
  chainId: number;
  wallet: Address;
  idempotencyKey: string;
  chainTimestampSeconds: number;
  userPoints: bigint;
  sourceReference: string;
  sourceDetails: Record<string, unknown>;
}): Promise<AwardResult> {
  if (input.userPoints <= 0n)
    return { status: "skipped", taskCode: input.taskCode, reason: "zero_value" };
  const user = await resolveAcademyUserByWalletAddress(input.wallet);
  if (!user)
    return { status: "skipped", taskCode: input.taskCode, reason: "recipient_user_missing" };

  return db.transaction(async (client) => {
    const program = await resolveActiveAcademyProgram(client);
    if (!program)
      return {
        status: "skipped",
        taskCode: input.taskCode,
        reason: "academy_program_not_configured",
      };
    const task = await resolveAcademyTaskDefinition(client, program.id, input.taskCode);
    if (!task)
      return { status: "skipped", taskCode: input.taskCode, reason: "academy_task_not_configured" };
    if (!isAcademyProgramActiveAt(program, input.chainTimestampSeconds)) {
      return {
        status: "skipped",
        taskCode: input.taskCode,
        reason: "academy_season_out_of_window",
      };
    }

    const grossPoints = grossReferralBaseForExactUserPoints(input.userPoints);
    const entry = await recordAcademyTaskPoints(client, {
      program,
      activityDefinitionId: task.activityDefinition.id,
      userId: user.id,
      chainId: input.chainId,
      idempotencyKey: input.idempotencyKey,
      chainTimestampSeconds: input.chainTimestampSeconds,
      pointsDelta: grossPoints,
      sourceReference: input.sourceReference,
      sourceDetails: {
        ...input.sourceDetails,
        taskCode: input.taskCode,
        activityPoints: formatAcademyReferralPoints(input.userPoints),
        referralBasePoints: formatAcademyReferralPoints(grossPoints),
      },
      sourceKind: "contract_event",
    });
    return {
      status: "awarded",
      taskCode: input.taskCode,
      entryId: entry.id,
      pointsDelta: entry.pointsDelta,
    };
  });
}

async function handleQualifyingSwap(ctx: ContractEventHandlerContext, event: AnyContractEvent) {
  const pool = getAuroveSupportedPool(event.chainId, event.contractAddress);
  if (!pool) return { status: "skipped" as const, reason: "unsupported_pool" };

  if (event.raw.transaction.status !== "success") {
    return { status: "skipped" as const, reason: "reverted_transaction" };
  }
  if (event.raw.transaction.primaryQualifyingSwapLogIndex !== event.logIndex) {
    return { status: "skipped" as const, reason: "not_primary_qualifying_swap_event" };
  }

  const args = event.namedArgs as Record<string, unknown>;
  const amount0 = asBigInt(args.amount0);
  const amount1 = asBigInt(args.amount1);
  if (amount0 == null || amount1 == null)
    return { status: "skipped" as const, reason: "malformed_swap" };
  // Use the previous block so this transaction cannot set the spot price used
  // to value its own Academy award.
  const poolStates = getRelayedPoolStates(event);
  const eventPool = poolStates.find(
    (candidate) => candidate.address.toLowerCase() === pool.address.toLowerCase(),
  );
  const inputToken = amount0 > 0n ? eventPool?.token0 : amount1 > 0n ? eventPool?.token1 : null;
  const inputAmount = amount0 > 0n ? amount0 : amount1 > 0n ? amount1 : 0n;
  const musd = getKnownMusdConfig(event.chainId);
  if (!eventPool || !inputToken || !musd || inputAmount <= 0n) {
    return { status: "skipped" as const, reason: "zero_or_unvalued_swap" };
  }
  const inputValue = valueTokenInMusdRaw({
    token: inputToken,
    amount: inputAmount,
    musd: musd.address,
    pools: poolStates,
  });
  if (!inputValue) return { status: "skipped" as const, reason: "musd_valuation_unavailable" };
  if (!isAcademyValuationWithinBounds(inputValue, musd.decimals)) {
    return { status: "skipped" as const, reason: "musd_valuation_out_of_bounds" };
  }
  const userPoints = fractionToPointUnits(
    inputValue,
    ACADEMY_SWAPPER_POINTS_NUMERATOR,
    ACADEMY_SWAPPER_POINTS_DENOMINATOR,
  );
  const wallet = getAddress(event.raw.transaction.from);

  const award = await awardActivity({
    taskCode: ACADEMY_QUALIFYING_SWAP_TASK_CODE,
    chainId: event.chainId,
    wallet,
    idempotencyKey: `academy:cl-swap:${event.chainId}:${event.txHash.toLowerCase()}`,
    chainTimestampSeconds: event.blockTimestamp,
    userPoints,
    sourceReference: `${event.chainId}:${event.txHash.toLowerCase()}:swap`,
    sourceDetails: {
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      initiatingAccount: wallet,
      pool: pool.address,
      poolKey: pool.key,
      inputToken,
      inputAmount: inputAmount.toString(),
      inputValueMUsdNumerator: inputValue.numerator.toString(),
      inputValueMUsdDenominator: inputValue.denominator.toString(),
      inputValueMUsdDecimals: musd.decimals,
      pointsRateNumerator: ACADEMY_SWAPPER_POINTS_NUMERATOR.toString(),
      pointsRateDenominator: ACADEMY_SWAPPER_POINTS_DENOMINATOR.toString(),
      valuationMethod: "canonical_supported_pool_spot_price",
    },
  });
  ctx.logger.info(stringifyJsonSafe({ scope: "internal-events", event: "academy.cl_swap", award }));
  return { award, fingerprint: event.fingerprint };
}

async function handlePositionFeesCollected(
  ctx: ContractEventHandlerContext,
  event: AnyContractEvent,
) {
  const registry = getPortfolioRegistry(event.chainId);
  const manager = registry?.positionManager;
  if (
    !registry ||
    !manager ||
    manager.address.toLowerCase() !== event.contractAddress.toLowerCase()
  ) {
    return { status: "skipped" as const, reason: "unsupported_position_manager" };
  }
  const args = event.namedArgs as Record<string, unknown>;
  const tokenId = asBigInt(args.tokenId);
  const collected0 = asBigInt(args.amount0);
  const collected1 = asBigInt(args.amount1);
  const recipient = asAddress(args.recipient);
  if (tokenId == null || collected0 == null || collected1 == null || !recipient) {
    return { status: "skipped" as const, reason: "malformed_fee_collection" };
  }

  if (event.raw.transaction.status !== "success") {
    return { status: "skipped" as const, reason: "reverted_transaction" };
  }
  const position = event.raw.position;
  if (!position || asBigInt(position.tokenId) !== tokenId) {
    return { status: "skipped" as const, reason: "position_unavailable" };
  }
  const principal = {
    amount0: BigInt(position.principalAmount0),
    amount1: BigInt(position.principalAmount1),
  };
  const fee0 = collected0 > principal.amount0 ? collected0 - principal.amount0 : 0n;
  const fee1 = collected1 > principal.amount1 ? collected1 - principal.amount1 : 0n;
  if (fee0 === 0n && fee1 === 0n)
    return { status: "skipped" as const, reason: "zero_fee_collection" };

  const token0 = getAddress(position.token0);
  const token1 = getAddress(position.token1);
  const pool = getAuroveSupportedPool(event.chainId, position.poolAddress);
  if (!pool) return { status: "skipped" as const, reason: "unsupported_pool" };

  const musd = getKnownMusdConfig(event.chainId);
  const poolStates = getRelayedPoolStates(event);
  if (!musd) return { status: "skipped" as const, reason: "musd_valuation_unavailable" };
  const value0 = valueTokenInMusdRaw({
    token: token0,
    amount: fee0,
    musd: musd.address,
    pools: poolStates,
  });
  const value1 = valueTokenInMusdRaw({
    token: token1,
    amount: fee1,
    musd: musd.address,
    pools: poolStates,
  });
  if ((fee0 > 0n && !value0) || (fee1 > 0n && !value1)) {
    return { status: "skipped" as const, reason: "musd_valuation_unavailable" };
  }
  const commonDenominator = (value0?.denominator ?? 1n) * (value1?.denominator ?? 1n);
  const totalValue: Fraction = {
    numerator:
      (value0?.numerator ?? 0n) * (value1?.denominator ?? 1n) +
      (value1?.numerator ?? 0n) * (value0?.denominator ?? 1n),
    denominator: commonDenominator,
  };
  if (!isAcademyValuationWithinBounds(totalValue, musd.decimals)) {
    return { status: "skipped" as const, reason: "musd_valuation_out_of_bounds" };
  }
  const userPoints = fractionToPointUnits(
    totalValue,
    ACADEMY_LP_POINTS_NUMERATOR,
    ACADEMY_LP_POINTS_DENOMINATOR,
  );
  let wallet = recipient;
  if (!(await resolveAcademyUserByWalletAddress(wallet))) wallet = getAddress(position.owner);

  const award = await awardActivity({
    taskCode: ACADEMY_LP_FEES_COLLECTED_TASK_CODE,
    chainId: event.chainId,
    wallet,
    idempotencyKey: `academy:cl-fees:${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`,
    chainTimestampSeconds: event.blockTimestamp,
    userPoints,
    sourceReference: `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}:fees`,
    sourceDetails: {
      txHash: event.txHash,
      logIndex: event.logIndex,
      blockNumber: event.blockNumber,
      positionTokenId: tokenId.toString(),
      recipient,
      creditedWallet: wallet,
      pool: pool.address,
      poolKey: pool.key,
      token0,
      token1,
      collectedAmount0: collected0.toString(),
      collectedAmount1: collected1.toString(),
      principalAmount0: principal.amount0.toString(),
      principalAmount1: principal.amount1.toString(),
      collectedFeeAmount0: fee0.toString(),
      collectedFeeAmount1: fee1.toString(),
      collectedFeesValueMUsdNumerator: totalValue.numerator.toString(),
      collectedFeesValueMUsdDenominator: totalValue.denominator.toString(),
      collectedFeesValueMUsdDecimals: musd.decimals,
      pointsMultiplierNumerator: ACADEMY_LP_POINTS_NUMERATOR.toString(),
      pointsMultiplierDenominator: ACADEMY_LP_POINTS_DENOMINATOR.toString(),
      valuationMethod: "canonical_supported_pool_spot_price",
    },
  });
  ctx.logger.info(
    stringifyJsonSafe({ scope: "internal-events", event: "academy.cl_fees_collected", award }),
  );
  return { award, fingerprint: event.fingerprint };
}

const contractEventHandlers = new Map<string, AnyContractEventHandler>();

for (const contractName of ["MUSD-avBTCm", "avBTCm-avMEZOm"] as const) {
  registerContractEventHandler({
    key: buildHandlerKeyTyped(contractName as never, "Swap" as never),
    description:
      "Award Academy swapper points for one qualifying concentrated-liquidity swap transaction.",
    contractName: contractName as never,
    eventName: "Swap" as never,
    run: handleQualifyingSwap,
  });
}

registerContractEventHandler({
  key: buildHandlerKeyTyped("NonfungiblePositionManager" as never, "Collect" as never),
  description: "Award Academy LP points for actual fees collected from a supported position.",
  contractName: "NonfungiblePositionManager" as never,
  eventName: "Collect" as never,
  run: handlePositionFeesCollected,
});

export function registerContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(
  handler: ContractEventHandlerDefinition<TContractName, TEventName>,
): ContractEventHandlerDefinition<TContractName, TEventName> {
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
export function getContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler | null {
  return contractEventHandlers.get(`${contractName}.${eventName}`) ?? null;
}

export function countRegisteredContractEventHandlers(): number {
  return contractEventHandlers.size;
}

export function hasRegisteredContractEventHandlers(contractName: ContractName): boolean {
  const keyPrefix = `${contractName}.`;
  return Array.from(contractEventHandlers.keys()).some((key) => key.startsWith(keyPrefix));
}
