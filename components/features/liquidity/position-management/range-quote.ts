import type { Address } from "viem";

import {
  getAmountsForLiquidity,
  getLiquidityForAmounts,
  tickToSqrtPriceX96BigInt,
  type SlipstreamPoolState,
  type SlipstreamTickRange,
} from "../slipstream-adapter";
import { isSlipstreamRangeValid } from "../slipstream-liquidity-quote";

export const RANGE_MINT_HAIRCUT_BPS = 1n;

export type RangeMigrationQuoteStatus =
  | "ok"
  | "unchanged-range"
  | "invalid-range"
  | "zero-liquidity"
  | "unavailable";

export type RangeMigrationQuote = {
  status: RangeMigrationQuoteStatus;
  errorMessage: string | null;
  beginsInRange: boolean;
  available0: bigint;
  available1: bigint;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Used: bigint;
  amount1Used: bigint;
  amount0Leftover: bigint;
  amount1Leftover: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  liquidity: bigint;
};

export function haircutAmount(amount: bigint, bps: bigint = RANGE_MINT_HAIRCUT_BPS) {
  if (amount <= 1n) return amount;
  const clipped = bps < 0n ? 0n : bps > 10_000n ? 10_000n : bps;
  const cut = (amount * clipped) / 10_000n;
  return amount - (cut > 0n ? cut : 1n);
}

export function slippageAdjustedAmount(amount: bigint, slippageBps: bigint) {
  if (amount <= 0n) return 0n;
  const clipped = slippageBps < 0n ? 0n : slippageBps > 10_000n ? 10_000n : slippageBps;
  return (amount * (10_000n - clipped)) / 10_000n;
}

export function collectablePositionAmounts(params: {
  rawAmount0?: bigint;
  rawAmount1?: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}) {
  return {
    amount0: (params.rawAmount0 ?? 0n) + params.tokensOwed0,
    amount1: (params.rawAmount1 ?? 0n) + params.tokensOwed1,
  };
}

export function sameTickRange(
  left: SlipstreamTickRange | null | undefined,
  right: SlipstreamTickRange | null | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.tickLower === right.tickLower &&
      left.tickUpper === right.tickUpper,
  );
}

export function buildRangeMigrationQuote(params: {
  pool: SlipstreamPoolState;
  currentRange: SlipstreamTickRange;
  nextRange: SlipstreamTickRange | null;
  amount0: bigint;
  amount1: bigint;
  extraAmount0?: bigint;
  extraAmount1?: bigint;
  slippageBps: bigint;
}): RangeMigrationQuote {
  const extra0 = params.extraAmount0 ?? 0n;
  const extra1 = params.extraAmount1 ?? 0n;
  const available0 = params.amount0 + extra0;
  const available1 = params.amount1 + extra1;
  const empty = {
    available0,
    available1,
    amount0Desired: 0n,
    amount1Desired: 0n,
    amount0Used: 0n,
    amount1Used: 0n,
    amount0Leftover: available0,
    amount1Leftover: available1,
    amount0Min: 0n,
    amount1Min: 0n,
    liquidity: 0n,
  };

  if (!params.pool.tickSpacing || params.pool.currentTick === null || params.pool.sqrtPriceX96 === null) {
    return {
      status: "unavailable",
      errorMessage: "Pool price is temporarily unavailable.",
      beginsInRange: false,
      ...empty,
    };
  }

  if (!params.nextRange || !isSlipstreamRangeValid(params.nextRange, params.pool.tickSpacing)) {
    return {
      status: "invalid-range",
      errorMessage: "Choose a valid tick range aligned with the pool spacing.",
      beginsInRange: false,
      ...empty,
    };
  }

  if (sameTickRange(params.currentRange, params.nextRange) && extra0 <= 0n && extra1 <= 0n) {
    return {
      status: "unchanged-range",
      errorMessage: "Choose a different range to migrate this position.",
      beginsInRange:
        params.pool.currentTick >= params.nextRange.tickLower &&
        params.pool.currentTick < params.nextRange.tickUpper,
      ...empty,
    };
  }

  const sqrtLowerX96 = tickToSqrtPriceX96BigInt(params.nextRange.tickLower);
  const sqrtUpperX96 = tickToSqrtPriceX96BigInt(params.nextRange.tickUpper);
  const desired0 = haircutAmount(params.amount0) + extra0;
  const desired1 = haircutAmount(params.amount1) + extra1;
  const liquidity = getLiquidityForAmounts({
    amount0: desired0,
    amount1: desired1,
    sqrtCurrentX96: params.pool.sqrtPriceX96,
    sqrtLowerX96,
    sqrtUpperX96,
  });
  const used = getAmountsForLiquidity({
    liquidity,
    sqrtCurrentX96: params.pool.sqrtPriceX96,
    sqrtLowerX96,
    sqrtUpperX96,
  });
  const beginsInRange =
    params.pool.currentTick >= params.nextRange.tickLower &&
    params.pool.currentTick < params.nextRange.tickUpper;

  if (liquidity <= 0n || (used.amount0 <= 0n && used.amount1 <= 0n)) {
    return {
      status: "zero-liquidity",
      errorMessage:
        "The withdrawn tokens cannot seed this range at the current price. Choose a range that includes the current price, or keep the token the position already holds.",
      beginsInRange,
      ...empty,
      amount0Desired: desired0,
      amount1Desired: desired1,
    };
  }

  return {
    status: "ok",
    errorMessage: null,
    beginsInRange,
    available0,
    available1,
    amount0Desired: desired0,
    amount1Desired: desired1,
    amount0Used: used.amount0,
    amount1Used: used.amount1,
    amount0Leftover: available0 > used.amount0 ? available0 - used.amount0 : 0n,
    amount1Leftover: available1 > used.amount1 ? available1 - used.amount1 : 0n,
    amount0Min: slippageAdjustedAmount(used.amount0, params.slippageBps),
    amount1Min: slippageAdjustedAmount(used.amount1, params.slippageBps),
    liquidity,
  };
}

export function rangeMigrationMintParams(params: {
  quote: RangeMigrationQuote;
  pool: SlipstreamPoolState;
  range: SlipstreamTickRange;
  recipient: Address;
  deadline: bigint;
}) {
  return {
    token0: params.pool.token0!.address,
    token1: params.pool.token1!.address,
    tickSpacing: params.pool.tickSpacing!,
    tickLower: params.range.tickLower,
    tickUpper: params.range.tickUpper,
    amount0Desired: params.quote.amount0Desired,
    amount1Desired: params.quote.amount1Desired,
    amount0Min: params.quote.amount0Min,
    amount1Min: params.quote.amount1Min,
    recipient: params.recipient,
    deadline: params.deadline,
    sqrtPriceX96: 0n,
  };
}
