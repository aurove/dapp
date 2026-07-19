"use client";

import { Price, Token } from "@uniswap/sdk-core";
import { TickMath, nearestUsableTick, priceToClosestTick, tickToPrice } from "@uniswap/v3-sdk";
import { parseUnits, type Address } from "viem";

export type SlipstreamRangePreset = "focused" | "balanced" | "full-range" | "custom";
export type SlipstreamPoolKey = "BTC" | "MEZO";
export type SlipstreamPoolContractName = "MUSD-avBTCm" | "avBTCm-avMEZOm";

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

export type SlipstreamTickPoint = {
  tick: number;
  liquidityGross: number;
  isLive: boolean;
};

export type SlipstreamTickRange = {
  tickLower: number;
  tickUpper: number;
};

export type SlipstreamLiquiditySeries = {
  points: SlipstreamTickPoint[];
  maxLiquidity: number;
  hasLiveData: boolean;
};

export const SLIPSTREAM_RANGE_INTERVALS = {
  focused: 8,
  balanced: 24,
} as const;

export const SLIPSTREAM_LIVE_BAR_LIMIT = 72;
export const SLIPSTREAM_FALLBACK_BAR_LIMIT = 48;
export const SLIPSTREAM_POOL_CONTRACT_BY_KEY: Record<SlipstreamPoolKey, SlipstreamPoolContractName> = {
  BTC: "MUSD-avBTCm",
  MEZO: "avBTCm-avMEZOm",
};
// Mirrors the CL pool read surface from the contract registry's concentrated-liquidity pool entries.
export const SLIPSTREAM_POOL_READ_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      { internalType: "uint16", name: "observationIndex", type: "uint16" },
      { internalType: "uint16", name: "observationCardinality", type: "uint16" },
      { internalType: "uint16", name: "observationCardinalityNext", type: "uint16" },
      { internalType: "bool", name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tickSpacing",
    outputs: [{ internalType: "int24", name: "", type: "int24" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "int24", name: "", type: "int24" }],
    name: "ticks",
    outputs: [
      { internalType: "uint128", name: "liquidityGross", type: "uint128" },
      { internalType: "int128", name: "liquidityNet", type: "int128" },
      { internalType: "int128", name: "stakedLiquidityNet", type: "int128" },
      { internalType: "uint256", name: "feeGrowthOutside0X128", type: "uint256" },
      { internalType: "uint256", name: "feeGrowthOutside1X128", type: "uint256" },
      { internalType: "uint256", name: "rewardGrowthOutsideX128", type: "uint256" },
      { internalType: "int56", name: "tickCumulativeOutside", type: "int56" },
      { internalType: "uint160", name: "secondsPerLiquidityOutsideX128", type: "uint160" },
      { internalType: "uint32", name: "secondsOutside", type: "uint32" },
      { internalType: "bool", name: "initialized", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function resolveSlipstreamPoolContractName(key: SlipstreamPoolKey): SlipstreamPoolContractName {
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
  if (!Number.isFinite(tickSpacing) || tickSpacing <= 0) return 0;
  return nearestUsableTick(Math.trunc(tick), tickSpacing);
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
  const snappedLower = clampTickToBounds(snapTickToSpacing(range.tickLower, tickSpacing), minTick, maxTick - tickSpacing);
  const snappedUpper = clampTickToBounds(snapTickToSpacing(range.tickUpper, tickSpacing), minTick + tickSpacing, maxTick);

  if (snappedUpper > snappedLower) {
    return { tickLower: snappedLower, tickUpper: snappedUpper };
  }

  const fallbackLower = clampTickToBounds(snappedLower, minTick, maxTick - tickSpacing);
  const fallbackUpper = clampTickToBounds(fallbackLower + tickSpacing, minTick + tickSpacing, maxTick);

  if (fallbackUpper > fallbackLower) {
    return { tickLower: fallbackLower, tickUpper: fallbackUpper };
  }

  const fallbackUpperFromTop = maxTick;
  const fallbackLowerFromTop = clampTickToBounds(fallbackUpperFromTop - tickSpacing, minTick, maxTick - tickSpacing);
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

export function buildSampleTicks(
  range: SlipstreamTickRange,
  tickSpacing: number,
  maxPoints = SLIPSTREAM_LIVE_BAR_LIMIT,
) {
  const spanTicks = Math.max(tickSpacing, range.tickUpper - range.tickLower);
  const usableTickCount = Math.max(1, Math.trunc(spanTicks / tickSpacing));
  const pointCount = Math.max(2, Math.min(maxPoints, usableTickCount + 1));
  const step = Math.max(tickSpacing, Math.trunc(spanTicks / (pointCount - 1) / tickSpacing) * tickSpacing);
  const ticks: number[] = [];

  for (let tick = range.tickLower; tick <= range.tickUpper; tick += step) {
    ticks.push(clampTickToBounds(snapTickToSpacing(tick, tickSpacing), range.tickLower, range.tickUpper));
    if (ticks.length >= pointCount) break;
  }

  const lastTick = ticks[ticks.length - 1];
  if (lastTick !== range.tickUpper) {
    ticks.push(range.tickUpper);
  }

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function toToken(poolToken: SlipstreamTokenInfo, chainId: number) {
  return new Token(chainId, poolToken.address, poolToken.decimals, poolToken.symbol ?? undefined, poolToken.name ?? undefined);
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
  const { pool, tick, invert = false } = params;
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
  return price.toSignificant(params.significantDigits ?? 5);
}

export function formatPriceLabel(params: {
  pool: SlipstreamPoolState;
  tick: number;
  invert?: boolean;
}) {
  const { pool, tick, invert = false } = params;
  const price = getTickPrice({ pool, tick, invert });
  const base = invert ? pool.token1 : pool.token0;
  const quote = invert ? pool.token0 : pool.token1;
  const baseLabel = base?.symbol ?? shortenAddress(base?.address);
  const quoteLabel = quote?.symbol ?? shortenAddress(quote?.address);

  if (!price) {
    return `${baseLabel}/${quoteLabel}`;
  }

  return `${price.toSignificant(5)} ${quoteLabel} / ${baseLabel}`;
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
  invert?: boolean;
}) {
  const { pool, value } = params;
  const token0 = pool.token0;
  const token1 = pool.token1;
  const parsed = normalizePriceInput(value);

  if (!token0 || !token1 || parsed === null) return null;

  try {
    const price = new Price(
      toToken(token0, pool.chainId),
      toToken(token1, pool.chainId),
      "1000000000000000000",
      parsed.toString(),
    );
    return priceToClosestTick(price);
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

  return {
    lower: formatPriceInputValue({ pool: params.pool, tick: params.range.tickLower }),
    upper: formatPriceInputValue({ pool: params.pool, tick: params.range.tickUpper }),
  };
}

export function buildFallbackLiquiditySeries(params: {
  range: SlipstreamTickRange;
  tickSpacing: number;
  currentTick: number;
  maxPoints?: number;
}) {
  const points = buildSampleTicks(params.range, params.tickSpacing, params.maxPoints ?? SLIPSTREAM_FALLBACK_BAR_LIMIT);
  const midpoint = getRangeMidpoint(params.range);
  const sigma = Math.max(params.tickSpacing * 6, (params.range.tickUpper - params.range.tickLower) / 5);

  const seriesPoints = points.map((tick, index) => {
    const distance = Math.abs(tick - midpoint);
    const wave = Math.exp(-((distance * distance) / (2 * sigma * sigma)));
    const ripple = 0.92 + ((index % 5) * 0.03);
    const bias = 0.82 + (Math.abs(tick - params.currentTick) <= params.tickSpacing * 2 ? 0.55 : 0);

    return {
      tick,
      liquidityGross: Math.max(1, Math.round(wave * ripple * bias * 100)),
      isLive: false,
    };
  });

  return {
    points: seriesPoints,
    maxLiquidity: Math.max(...seriesPoints.map((point) => point.liquidityGross), 1),
    hasLiveData: false,
  } satisfies SlipstreamLiquiditySeries;
}

export function buildLiquiditySeries(params: {
  range: SlipstreamTickRange;
  tickSpacing: number;
  currentTick: number;
  liveLiquidityByTick: Map<number, bigint | null>;
  maxPoints?: number;
}) {
  const ticks = buildSampleTicks(params.range, params.tickSpacing, params.maxPoints ?? SLIPSTREAM_LIVE_BAR_LIMIT);

  if (ticks.length === 0) {
    return buildFallbackLiquiditySeries({
      range: params.range,
      tickSpacing: params.tickSpacing,
      currentTick: params.currentTick,
      maxPoints: params.maxPoints,
    });
  }

  const livePoints = ticks.map((tick) => {
    const rawLiquidity = params.liveLiquidityByTick.get(tick);
    return {
      tick,
      liquidityGross: rawLiquidity === null || rawLiquidity === undefined ? 0 : Number(rawLiquidity),
      isLive: rawLiquidity !== null && rawLiquidity !== undefined,
    };
  });

  const maxLiquidity = livePoints.reduce((max, point) => Math.max(max, point.liquidityGross), 0);

  if (maxLiquidity <= 0) {
    return buildFallbackLiquiditySeries({
      range: params.range,
      tickSpacing: params.tickSpacing,
      currentTick: params.currentTick,
      maxPoints: params.maxPoints,
    });
  }

  return {
    points: livePoints,
    maxLiquidity,
    hasLiveData: true,
  } satisfies SlipstreamLiquiditySeries;
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
  return mulDivFloor(mulDivFloor(amount0, sqrtLowerX96, 1n) * sqrtUpperX96, 1n, (sqrtUpperX96 - sqrtLowerX96) * SLIPSTREAM_Q96);
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
