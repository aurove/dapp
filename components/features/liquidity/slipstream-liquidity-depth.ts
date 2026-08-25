import { TickMath } from "@uniswap/v3-sdk";
import type { Abi, Address, PublicClient } from "viem";

export const DEFAULT_MAX_BITMAP_WORDS = 512;
const MULTICALL_CHUNK_SIZE = 256;

export type SlipstreamInitializedTick = {
  tick: number;
  liquidityGross: bigint;
  liquidityNet: bigint;
};

export type SlipstreamLiquidityInterval = {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

export type SlipstreamDepthStatus = "complete" | "partial";

export type SlipstreamLiquidityDepthSnapshot = {
  chainId: number;
  poolAddress: Address;
  blockNumber: bigint;
  token0: Address;
  token1: Address;
  sqrtPriceX96: bigint;
  currentTick: number;
  activeLiquidity: bigint;
  tickSpacing: number;
  initializedTicks: SlipstreamInitializedTick[];
  intervals: SlipstreamLiquidityInterval[];
  coverage: { tickLower: number; tickUpper: number };
  status: SlipstreamDepthStatus;
  validationWarnings: string[];
};

export class SlipstreamLiquidityDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlipstreamLiquidityDataError";
  }
}

type ReconstructParams = {
  initializedTicks: readonly SlipstreamInitializedTick[];
  currentTick: number;
  activeLiquidity: bigint;
  tickSpacing: number;
  coverage: { tickLower: number; tickUpper: number };
  complete: boolean;
};

function assertInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new SlipstreamLiquidityDataError(`Pool returned an invalid ${label}.`);
  }
  return value;
}

function assertBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") {
    throw new SlipstreamLiquidityDataError(`Pool returned an invalid ${label}.`);
  }
  return value;
}

function assertAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new SlipstreamLiquidityDataError(`Pool returned an invalid ${label}.`);
  }
  return value as Address;
}

function tupleValue(value: unknown, index: number, key: string): unknown {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
  return undefined;
}

function floorDiv(dividend: number, divisor: number) {
  return Math.floor(dividend / divisor);
}

export function getSlipstreamUsableTickBounds(tickSpacing: number) {
  if (!Number.isSafeInteger(tickSpacing) || tickSpacing <= 0) {
    throw new SlipstreamLiquidityDataError("Pool tick spacing must be a positive integer.");
  }
  return {
    minUsable: Math.ceil(TickMath.MIN_TICK / tickSpacing) * tickSpacing,
    maxUsable: Math.floor(TickMath.MAX_TICK / tickSpacing) * tickSpacing,
  };
}

export function decodeInitializedTicksFromBitmap(
  words: readonly { wordPosition: number; bitmap: bigint }[],
  tickSpacing: number,
  bounds = getSlipstreamUsableTickBounds(tickSpacing),
) {
  const ticks: number[] = [];

  for (const { wordPosition, bitmap } of words) {
    if (!Number.isSafeInteger(wordPosition) || bitmap < 0n) {
      throw new SlipstreamLiquidityDataError("Pool returned an invalid tick bitmap word.");
    }

    let remaining = bitmap;
    let bit = 0;
    while (remaining !== 0n && bit < 256) {
      if ((remaining & 1n) === 1n) {
        const tick = (wordPosition * 256 + bit) * tickSpacing;
        if (tick >= bounds.minUsable && tick <= bounds.maxUsable) ticks.push(tick);
      }
      remaining >>= 1n;
      bit += 1;
    }
  }

  return ticks.sort((a, b) => a - b);
}

export function reconstructSlipstreamLiquidity(params: ReconstructParams): {
  intervals: SlipstreamLiquidityInterval[];
  validationWarnings: string[];
} {
  const { currentTick, activeLiquidity, tickSpacing, coverage, complete } = params;

  if (!Number.isSafeInteger(currentTick)) {
    throw new SlipstreamLiquidityDataError("Current tick is not a safe integer.");
  }
  if (activeLiquidity < 0n) {
    throw new SlipstreamLiquidityDataError("Pool active liquidity cannot be negative.");
  }
  if (
    !Number.isSafeInteger(coverage.tickLower) ||
    !Number.isSafeInteger(coverage.tickUpper) ||
    coverage.tickUpper <= coverage.tickLower
  ) {
    throw new SlipstreamLiquidityDataError("Liquidity coverage is invalid.");
  }

  const ticks = [...params.initializedTicks].sort((a, b) => a.tick - b.tick);
  const seen = new Set<number>();
  for (const initialized of ticks) {
    if (!Number.isSafeInteger(initialized.tick) || initialized.tick % tickSpacing !== 0) {
      throw new SlipstreamLiquidityDataError(
        `Initialized tick ${initialized.tick} does not respect tick spacing ${tickSpacing}.`,
      );
    }
    if (seen.has(initialized.tick)) {
      throw new SlipstreamLiquidityDataError(`Initialized tick ${initialized.tick} is duplicated.`);
    }
    if (initialized.liquidityGross <= 0n) {
      throw new SlipstreamLiquidityDataError(
        `Initialized tick ${initialized.tick} has no gross liquidity.`,
      );
    }
    if (
      initialized.liquidityNet > initialized.liquidityGross ||
      initialized.liquidityNet < -initialized.liquidityGross
    ) {
      throw new SlipstreamLiquidityDataError(
        `Initialized tick ${initialized.tick} has liquidityNet larger than liquidityGross.`,
      );
    }
    seen.add(initialized.tick);
  }

  const ticksInCoverage = ticks.filter(
    ({ tick }) => tick >= coverage.tickLower && tick <= coverage.tickUpper,
  );
  const boundaries = [
    coverage.tickLower,
    ...ticksInCoverage.map(({ tick }) => tick),
    coverage.tickUpper,
  ].filter((tick, index, all) => index === 0 || tick !== all[index - 1]);

  const anchorTick = Math.min(Math.max(currentTick, coverage.tickLower), coverage.tickUpper - 1);
  let anchorIndex = -1;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    if (anchorTick >= boundaries[index] && anchorTick < boundaries[index + 1]) {
      anchorIndex = index;
      break;
    }
  }
  if (anchorIndex < 0) {
    throw new SlipstreamLiquidityDataError(
      "Current tick is outside the loaded liquidity coverage.",
    );
  }

  const netByTick = new Map(ticksInCoverage.map(({ tick, liquidityNet }) => [tick, liquidityNet]));
  const liquidityByInterval = new Array<bigint>(boundaries.length - 1);
  liquidityByInterval[anchorIndex] = activeLiquidity;

  let running = activeLiquidity;
  for (let index = anchorIndex + 1; index < liquidityByInterval.length; index += 1) {
    const crossedTick = boundaries[index];
    running += netByTick.get(crossedTick) ?? 0n;
    if (running < 0n) {
      throw new SlipstreamLiquidityDataError(
        `Active liquidity became negative while crossing tick ${crossedTick} upwards.`,
      );
    }
    liquidityByInterval[index] = running;
  }

  running = activeLiquidity;
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    const crossedTick = boundaries[index + 1];
    running -= netByTick.get(crossedTick) ?? 0n;
    if (running < 0n) {
      throw new SlipstreamLiquidityDataError(
        `Active liquidity became negative while crossing tick ${crossedTick} downwards.`,
      );
    }
    liquidityByInterval[index] = running;
  }

  const intervals = liquidityByInterval.map((liquidity, index) => ({
    tickLower: boundaries[index],
    tickUpper: boundaries[index + 1],
    liquidity,
  }));
  const anchor = intervals[anchorIndex];
  if (!anchor || anchor.liquidity !== activeLiquidity) {
    throw new SlipstreamLiquidityDataError(
      "Reconstructed liquidity at the current tick does not match pool.liquidity.",
    );
  }

  const validationWarnings: string[] = [];
  if (complete) {
    const expectedActiveLiquidity = ticks.reduce(
      (sum, initialized) =>
        initialized.tick <= currentTick ? sum + initialized.liquidityNet : sum,
      0n,
    );
    if (expectedActiveLiquidity !== activeLiquidity) {
      throw new SlipstreamLiquidityDataError(
        `Initialized ticks imply active liquidity ${expectedActiveLiquidity.toString()}, but pool.liquidity is ${activeLiquidity.toString()}.`,
      );
    }

    const cumulativeNet = ticks.reduce((sum, initialized) => sum + initialized.liquidityNet, 0n);
    if (cumulativeNet !== 0n) {
      throw new SlipstreamLiquidityDataError(
        `Initialized tick liquidityNet does not reconcile (net ${cumulativeNet.toString()}).`,
      );
    }
  } else {
    validationWarnings.push(
      "Only part of the pool tick bitmap was loaded; liquidity outside the reported coverage is unavailable.",
    );
  }

  return { intervals, validationWarnings };
}

async function multicallInChunks(
  client: PublicClient,
  contracts: readonly Record<string, unknown>[],
  blockNumber: bigint,
) {
  const output: unknown[] = [];
  for (let start = 0; start < contracts.length; start += MULTICALL_CHUNK_SIZE) {
    const chunk = contracts.slice(start, start + MULTICALL_CHUNK_SIZE);
    const values = await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: chunk as Parameters<PublicClient["multicall"]>[0]["contracts"],
    });
    output.push(...(values as unknown[]));
  }
  return output;
}

export async function fetchSlipstreamLiquidityDepth(params: {
  client: PublicClient;
  chainId: number;
  poolAddress: Address;
  poolAbi: Abi;
  maxBitmapWords?: number;
}): Promise<SlipstreamLiquidityDepthSnapshot> {
  const { client, chainId, poolAddress, poolAbi } = params;
  const blockNumber = await client.getBlockNumber();
  const baseContract = { address: poolAddress, abi: poolAbi } as const;
  const state = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { ...baseContract, functionName: "token0" },
      { ...baseContract, functionName: "token1" },
      { ...baseContract, functionName: "slot0" },
      { ...baseContract, functionName: "tickSpacing" },
      { ...baseContract, functionName: "liquidity" },
    ],
  });

  const token0 = assertAddress(state[0], "token0");
  const token1 = assertAddress(state[1], "token1");
  const sqrtPriceX96 = assertBigInt(tupleValue(state[2], 0, "sqrtPriceX96"), "sqrt price");
  const currentTick = assertInteger(tupleValue(state[2], 1, "tick"), "current tick");
  const tickSpacing = assertInteger(state[3], "tick spacing");
  const activeLiquidity = assertBigInt(state[4], "active liquidity");
  const bounds = getSlipstreamUsableTickBounds(tickSpacing);
  const minWord = floorDiv(floorDiv(bounds.minUsable, tickSpacing), 256);
  const maxWord = floorDiv(floorDiv(bounds.maxUsable, tickSpacing), 256);
  const totalWordCount = maxWord - minWord + 1;
  const maxBitmapWords = Math.max(1, params.maxBitmapWords ?? DEFAULT_MAX_BITMAP_WORDS);
  const complete = totalWordCount <= maxBitmapWords;

  let firstWord = minWord;
  let lastWord = maxWord;
  if (!complete) {
    const currentWord = floorDiv(floorDiv(currentTick, tickSpacing), 256);
    const before = Math.floor((maxBitmapWords - 1) / 2);
    firstWord = Math.max(minWord, currentWord - before);
    lastWord = Math.min(maxWord, firstWord + maxBitmapWords - 1);
    firstWord = Math.max(minWord, lastWord - maxBitmapWords + 1);
  }

  const wordPositions = Array.from(
    { length: lastWord - firstWord + 1 },
    (_, index) => firstWord + index,
  );
  const bitmaps = await multicallInChunks(
    client,
    wordPositions.map((wordPosition) => ({
      ...baseContract,
      functionName: "tickBitmap",
      args: [wordPosition],
    })),
    blockNumber,
  );
  const initializedTickNumbers = decodeInitializedTicksFromBitmap(
    wordPositions.map((wordPosition, index) => ({
      wordPosition,
      bitmap: assertBigInt(bitmaps[index], `tick bitmap word ${wordPosition}`),
    })),
    tickSpacing,
    bounds,
  );

  const rawTicks = await multicallInChunks(
    client,
    initializedTickNumbers.map((tick) => ({
      ...baseContract,
      functionName: "ticks",
      args: [tick],
    })),
    blockNumber,
  );
  const initializedTicks = initializedTickNumbers.map((tick, index) => {
    const raw = rawTicks[index];
    const liquidityGross = assertBigInt(
      tupleValue(raw, 0, "liquidityGross"),
      `gross liquidity at tick ${tick}`,
    );
    const liquidityNet = assertBigInt(
      tupleValue(raw, 1, "liquidityNet"),
      `net liquidity at tick ${tick}`,
    );
    const initializedValue = tupleValue(raw, 9, "initialized");
    if (initializedValue !== true) {
      throw new SlipstreamLiquidityDataError(`Bitmap tick ${tick} is not initialized.`);
    }
    return { tick, liquidityGross, liquidityNet };
  });

  const coverage = {
    tickLower: complete
      ? bounds.minUsable
      : Math.max(bounds.minUsable, firstWord * 256 * tickSpacing),
    tickUpper: complete
      ? bounds.maxUsable
      : Math.min(bounds.maxUsable, (lastWord + 1) * 256 * tickSpacing),
  };
  const reconstructed = reconstructSlipstreamLiquidity({
    initializedTicks,
    currentTick,
    activeLiquidity,
    tickSpacing,
    coverage,
    complete,
  });

  return {
    chainId,
    poolAddress,
    blockNumber,
    token0,
    token1,
    sqrtPriceX96,
    currentTick,
    activeLiquidity,
    tickSpacing,
    initializedTicks,
    intervals: reconstructed.intervals,
    coverage,
    status: complete ? "complete" : "partial",
    validationWarnings: reconstructed.validationWarnings,
  };
}

export function formatRawLiquidity(value: bigint) {
  const text = value.toString();
  if (text.length <= 6) return text;
  const exponent = text.length - 1;
  const decimals = text.slice(1, 4).replace(/0+$/, "");
  return `${text[0]}${decimals ? `.${decimals}` : ""}e${exponent}`;
}

export function scaleLiquidityForChart(value: bigint, maxLiquidity: bigint) {
  if (value <= 0n || maxLiquidity <= 0n) return 0;
  return Number((value * 1_000_000n) / maxLiquidity);
}
