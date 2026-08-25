"use client";

import { Price, Token } from "@uniswap/sdk-core";
import { TickMath, nearestUsableTick, priceToClosestTick, tickToPrice } from "@uniswap/v3-sdk";
import { parseUnits, type Address } from "viem";

import {
  AUROVE_LIQUIDITY_PAIRS,
  type AuroveLiquidityPairKey,
  type AuroveLiquidityPoolContractName,
} from "@/lib/config/supported-liquidity-pools";
import { formatCompactDecimal } from "@/lib/web3/value-parsers";

export type SlipstreamRangePreset = "focused" | "balanced" | "full-range" | "custom";
export type SlipstreamPoolKey = AuroveLiquidityPairKey;
export type SlipstreamPoolContractName = AuroveLiquidityPoolContractName;

export type SlipstreamTokenInfo = {
  address: Address;
  decimals: number;
  symbol: string | null;
  name: string | null;
};

export type SlipstreamPoolState = {
  chainId: number;
  address: Address;
  token0: SlipstreamTokenInfo | null;
  token1: SlipstreamTokenInfo | null;
  currentTick: number | null;
  sqrtPriceX96: bigint | null;
  tickSpacing: number | null;
};

export type SlipstreamTickRange = {
  tickLower: number;
  tickUpper: number;
};

export type SlipstreamDisplayPriceOrientation = {
  base: SlipstreamTokenInfo | null;
  quote: SlipstreamTokenInfo | null;
  inverted: boolean;
};

export const SLIPSTREAM_RANGE_INTERVALS = {
  focused: 8,
  balanced: 24,
} as const;

export const SLIPSTREAM_POOL_CONTRACT_BY_KEY = Object.fromEntries(
  AUROVE_LIQUIDITY_PAIRS.map((pair) => [pair.key, pair.poolContractName]),
) as Record<SlipstreamPoolKey, SlipstreamPoolContractName>;
export function resolveSlipstreamPoolContractName(
  key: SlipstreamPoolKey,
): SlipstreamPoolContractName {
  return SLIPSTREAM_POOL_CONTRACT_BY_KEY[key];
}

function isFiniteTick(tick: number) {
  return Number.isFinite(tick) && Number.isInteger(tick);
}

export function getPoolTickBounds(tickSpacing: number) {
  const minUsable = Math.ceil(TickMath.MIN_TICK / tickSpacing) * tickSpacing;
  const maxUsable = Math.floor(TickMath.MAX_TICK / tickSpacing) * tickSpacing;

  return {
    minUsable,
    maxUsable,
  };
}

export function getFullRangeHalfIntervals(tickSpacing: number) {
  const bounds = getPoolTickBounds(tickSpacing);
  return Math.ceil((bounds.maxUsable - bounds.minUsable) / (2 * tickSpacing));
}

export function snapTickToSpacing(tick: number, tickSpacing: number) {
  if (!Number.isFinite(tick) || !Number.isInteger(tickSpacing) || tickSpacing <= 0) return 0;
  const boundedTick = clampTickToBounds(Math.trunc(tick), TickMath.MIN_TICK, TickMath.MAX_TICK);
  return nearestUsableTick(boundedTick, tickSpacing);
}

export function clampTickToBounds(tick: number, minTick: number, maxTick: number) {
  return Math.min(maxTick, Math.max(minTick, tick));
}

export function normalizeTickRange(
  range: SlipstreamTickRange,
  tickSpacing: number,
  bounds: ReturnType<typeof getPoolTickBounds> = getPoolTickBounds(tickSpacing),
): SlipstreamTickRange {
  const minTick = bounds.minUsable;
  const maxTick = bounds.maxUsable;
  const snappedLower = clampTickToBounds(
    snapTickToSpacing(range.tickLower, tickSpacing),
    minTick,
    maxTick - tickSpacing,
  );
  const snappedUpper = clampTickToBounds(
    snapTickToSpacing(range.tickUpper, tickSpacing),
    minTick + tickSpacing,
    maxTick,
  );

  if (snappedUpper > snappedLower) {
    return { tickLower: snappedLower, tickUpper: snappedUpper };
  }

  const fallbackLower = clampTickToBounds(snappedLower, minTick, maxTick - tickSpacing);
  const fallbackUpper = clampTickToBounds(
    fallbackLower + tickSpacing,
    minTick + tickSpacing,
    maxTick,
  );

  if (fallbackUpper > fallbackLower) {
    return { tickLower: fallbackLower, tickUpper: fallbackUpper };
  }

  const fallbackUpperFromTop = maxTick;
  const fallbackLowerFromTop = clampTickToBounds(
    fallbackUpperFromTop - tickSpacing,
    minTick,
    maxTick - tickSpacing,
  );
  return {
    tickLower: fallbackLowerFromTop,
    tickUpper: fallbackUpperFromTop,
  };
}

export function buildPresetRange(
  preset: Exclude<SlipstreamRangePreset, "custom">,
  currentTick: number,
  tickSpacing: number,
) {
  const bounds = getPoolTickBounds(tickSpacing);

  if (preset === "full-range") {
    return {
      tickLower: bounds.minUsable,
      tickUpper: bounds.maxUsable,
    };
  }

  const halfIntervals =
    preset === "focused" ? SLIPSTREAM_RANGE_INTERVALS.focused : SLIPSTREAM_RANGE_INTERVALS.balanced;
  const halfWidth = halfIntervals * tickSpacing;

  return normalizeTickRange(
    {
      tickLower: currentTick - halfWidth,
      tickUpper: currentTick + halfWidth,
    },
    tickSpacing,
    bounds,
  );
}

export function getRangeMidpoint(range: SlipstreamTickRange) {
  return Math.trunc((range.tickLower + range.tickUpper) / 2);
}

export function getRangeTickCount(range: SlipstreamTickRange, tickSpacing: number) {
  return Math.max(1, Math.trunc((range.tickUpper - range.tickLower) / tickSpacing));
}

function toToken(poolToken: SlipstreamTokenInfo, chainId: number) {
  return new Token(
    chainId,
    poolToken.address,
    poolToken.decimals,
    poolToken.symbol ?? undefined,
    poolToken.name ?? undefined,
  );
}

function displayTokenPriority(token: SlipstreamTokenInfo | null) {
  const identity = `${token?.symbol ?? ""} ${token?.name ?? ""}`.toUpperCase();
  if (identity.includes("MUSD")) return 0;
  if (identity.includes("BTC")) return 1;
  return 2;
}

function displayPriceBasePriority(token: SlipstreamTokenInfo | null) {
  const identity = `${token?.symbol ?? ""} ${token?.name ?? ""}`.toUpperCase();
  if (identity.includes("BTC")) return 0;
  if (identity.includes("MUSD")) return 1;
  return 2;
}

function getOrientation(
  pool: SlipstreamPoolState,
  priority: (token: SlipstreamTokenInfo | null) => number,
): SlipstreamDisplayPriceOrientation {
  const inverted = priority(pool.token1) < priority(pool.token0);
  return {
    base: inverted ? pool.token1 : pool.token0,
    quote: inverted ? pool.token0 : pool.token1,
    inverted,
  };
}

export function getDisplayTokenOrientation(pool: SlipstreamPoolState) {
  return getOrientation(pool, displayTokenPriority);
}

export function getDisplayPriceOrientation(pool: SlipstreamPoolState) {
  return getOrientation(pool, displayPriceBasePriority);
}

function displayTokenLabel(token: SlipstreamTokenInfo | null, fallback: string) {
  if (token?.symbol) return token.symbol;
  if (token?.address) return shortenAddress(token.address);
  return fallback;
}

export function formatDisplayPair(pool: SlipstreamPoolState) {
  const { base, quote, inverted } = getDisplayTokenOrientation(pool);
  return `${displayTokenLabel(base, inverted ? "Token 1" : "Token 0")} / ${displayTokenLabel(
    quote,
    inverted ? "Token 0" : "Token 1",
  )}`;
}

export function getDisplayPriceRangeTicks(pool: SlipstreamPoolState, range: SlipstreamTickRange) {
  return getDisplayPriceOrientation(pool).inverted
    ? { lowTick: range.tickUpper, highTick: range.tickLower }
    : { lowTick: range.tickLower, highTick: range.tickUpper };
}

function priceValueToText(price: ReturnType<typeof getTickPrice>) {
  if (!price) return "";
  return price.toFixed(18).replace(/\.?0+$/, "");
}

function normalizePriceInput(value: string) {
  const cleaned = value.trim().replace(/,/g, "");
  if (!cleaned) return null;
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  try {
    const parsed = parseUnits(cleaned, 18);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function getTickPrice(params: {
  pool: SlipstreamPoolState;
  tick: number;
  invert?: boolean;
}) {
  const { pool, tick } = params;
  const invert = params.invert ?? getDisplayPriceOrientation(pool).inverted;
  const token0 = pool.token0;
  const token1 = pool.token1;

  if (!token0 || !token1 || !isFiniteTick(tick)) return null;

  try {
    const price = tickToPrice(toToken(token0, pool.chainId), toToken(token1, pool.chainId), tick);
    return invert ? price.invert() : price;
  } catch {
    return null;
  }
}

export function formatTickPrice(params: {
  pool: SlipstreamPoolState;
  tick: number;
  invert?: boolean;
  significantDigits?: number;
}) {
  const price = getTickPrice(params);
  if (!price) return null;
  return formatCompactDecimal(price.toFixed(18), params.significantDigits ?? 5);
}

export function formatPriceLabel(params: {
  pool: SlipstreamPoolState;
  tick: number;
  invert?: boolean;
}) {
  const { pool, tick } = params;
  const invert = params.invert ?? getDisplayPriceOrientation(pool).inverted;
  const price = getTickPrice({ pool, tick, invert });
  const base = invert ? pool.token1 : pool.token0;
  const quote = invert ? pool.token0 : pool.token1;
  const baseLabel = base?.symbol ?? shortenAddress(base?.address);
  const quoteLabel = quote?.symbol ?? shortenAddress(quote?.address);

  if (!price) {
    return `${baseLabel}/${quoteLabel}`;
  }

  return `${formatCompactDecimal(price.toFixed(18))} ${quoteLabel} / ${baseLabel}`;
}

export function formatPriceInputValue(params: {
  pool: SlipstreamPoolState;
  tick: number;
  invert?: boolean;
}) {
  return priceValueToText(getTickPrice(params));
}

export function parsePriceInputToTick(params: {
  pool: SlipstreamPoolState;
  value: string;
  bound: "lower" | "upper";
  invert?: boolean;
}) {
  const { pool, value, bound } = params;
  const token0 = pool.token0;
  const token1 = pool.token1;
  const invert = params.invert ?? getDisplayPriceOrientation(pool).inverted;
  const parsed = normalizePriceInput(value);
  const tickSpacing = pool.tickSpacing ?? 1;

  if (!token0 || !token1 || parsed === null) return null;

  try {
    const price = new Price(
      toToken(invert ? token1 : token0, pool.chainId),
      toToken(invert ? token0 : token1, pool.chainId),
      "1000000000000000000",
      parsed.toString(),
    );
    const candidate = nearestUsableTick(priceToClosestTick(price), tickSpacing);
    const candidatePrice = getTickPrice({ pool, tick: candidate, invert });

    if (!candidatePrice) return null;

    if (bound === "lower") {
      if (candidatePrice.greaterThan(price)) {
        return candidate + (invert ? tickSpacing : -tickSpacing);
      }
      return candidate;
    }

    if (candidatePrice.lessThan(price)) {
      return candidate + (invert ? -tickSpacing : tickSpacing);
    }

    return candidate;
  } catch {
    return null;
  }
}

export function priceInputsForRange(params: {
  pool: SlipstreamPoolState;
  range: SlipstreamTickRange | null;
}) {
  if (!params.range) {
    return { lower: "", upper: "" };
  }

  const { lowTick, highTick } = getDisplayPriceRangeTicks(params.pool, params.range);

  return {
    lower: formatPriceInputValue({ pool: params.pool, tick: lowTick }),
    upper: formatPriceInputValue({ pool: params.pool, tick: highTick }),
  };
}

export function shortenAddress(address?: Address | null) {
  if (!address) return "0x0000";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function tickToSqrtPriceX96(tick: number) {
  return TickMath.getSqrtRatioAtTick(tick);
}

export function tickToSqrtPriceX96BigInt(tick: number) {
  return BigInt(tickToSqrtPriceX96(tick).toString());
}

export const SLIPSTREAM_Q96 = 1n << 96n;

export function mulDivFloor(a: bigint, b: bigint, denominator: bigint) {
  if (denominator === 0n) return 0n;
  return (a * b) / denominator;
}

export function getLiquidityForAmount0(params: {
  amount0: bigint;
  sqrtLowerX96: bigint;
  sqrtUpperX96: bigint;
}) {
  const { amount0, sqrtLowerX96, sqrtUpperX96 } = params;
  if (amount0 <= 0n || sqrtLowerX96 <= 0n || sqrtUpperX96 <= sqrtLowerX96) return 0n;
  return mulDivFloor(
    mulDivFloor(amount0, sqrtLowerX96, 1n) * sqrtUpperX96,
    1n,
    (sqrtUpperX96 - sqrtLowerX96) * SLIPSTREAM_Q96,
  );
}

export function getLiquidityForAmount1(params: {
  amount1: bigint;
  sqrtLowerX96: bigint;
  sqrtUpperX96: bigint;
}) {
  const { amount1, sqrtLowerX96, sqrtUpperX96 } = params;
  if (amount1 <= 0n || sqrtUpperX96 <= sqrtLowerX96) return 0n;
  return mulDivFloor(amount1, SLIPSTREAM_Q96, sqrtUpperX96 - sqrtLowerX96);
}

export function getLiquidityForAmount0WithinRange(params: {
  amount0: bigint;
  sqrtCurrentX96: bigint;
  sqrtUpperX96: bigint;
}) {
  const { amount0, sqrtCurrentX96, sqrtUpperX96 } = params;
  if (amount0 <= 0n || sqrtUpperX96 <= sqrtCurrentX96 || sqrtCurrentX96 <= 0n) return 0n;
  return mulDivFloor(
    amount0 * sqrtCurrentX96,
    sqrtUpperX96,
    (sqrtUpperX96 - sqrtCurrentX96) * SLIPSTREAM_Q96,
  );
}

export function getLiquidityForAmount1WithinRange(params: {
  amount1: bigint;
  sqrtLowerX96: bigint;
  sqrtCurrentX96: bigint;
}) {
  const { amount1, sqrtLowerX96, sqrtCurrentX96 } = params;
  if (amount1 <= 0n || sqrtCurrentX96 <= sqrtLowerX96) return 0n;
  return mulDivFloor(amount1, SLIPSTREAM_Q96, sqrtCurrentX96 - sqrtLowerX96);
}

export function getAmount0ForLiquidity(params: {
  liquidity: bigint;
  sqrtUpperX96: bigint;
  sqrtCurrentX96: bigint;
}) {
  const { liquidity, sqrtUpperX96, sqrtCurrentX96 } = params;
  if (liquidity <= 0n || sqrtCurrentX96 <= 0n) return 0n;
  return mulDivFloor(
    liquidity * (sqrtUpperX96 - sqrtCurrentX96) * SLIPSTREAM_Q96,
    1n,
    sqrtCurrentX96 * sqrtUpperX96,
  );
}

export function getAmount1ForLiquidity(params: {
  liquidity: bigint;
  sqrtLowerX96: bigint;
  sqrtCurrentX96: bigint;
}) {
  const { liquidity, sqrtLowerX96, sqrtCurrentX96 } = params;
  if (liquidity <= 0n || sqrtCurrentX96 <= 0n) return 0n;
  return mulDivFloor(liquidity, sqrtCurrentX96 - sqrtLowerX96, SLIPSTREAM_Q96);
}

export function getAmount0BelowRangeForLiquidity(params: {
  liquidity: bigint;
  sqrtLowerX96: bigint;
  sqrtUpperX96: bigint;
}) {
  const { liquidity, sqrtLowerX96, sqrtUpperX96 } = params;
  if (liquidity <= 0n || sqrtUpperX96 <= sqrtLowerX96) return 0n;
  return mulDivFloor(
    liquidity * (sqrtUpperX96 - sqrtLowerX96) * SLIPSTREAM_Q96,
    1n,
    sqrtLowerX96 * sqrtUpperX96,
  );
}

export function getAmount1AboveRangeForLiquidity(params: {
  liquidity: bigint;
  sqrtLowerX96: bigint;
  sqrtUpperX96: bigint;
}) {
  const { liquidity, sqrtLowerX96, sqrtUpperX96 } = params;
  if (liquidity <= 0n || sqrtUpperX96 <= sqrtLowerX96) return 0n;
  return mulDivFloor(liquidity, sqrtUpperX96 - sqrtLowerX96, SLIPSTREAM_Q96);
}
