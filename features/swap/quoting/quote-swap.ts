import { TickMath, v3Swap, type TickDataProvider } from "@uniswap/v3-sdk";
import type { Abi, Address, PublicClient } from "viem";
import { hasChainTimestampPassed } from "@/lib/web3/chain-time";
import type { SwapHop, SwapQuote, SwapRegistry, SwapRouteResult, SwapTradeType } from "../domain";
import { discoverClRoutes, encodeClPath, hopVenue } from "../routing";
import { quoteBasicSwapRoutes } from "./quote-basic";

type PoolSnapshot = {
  token0: Address;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  fee: number;
  tickSpacing: number;
  tickDataProvider: TickDataProvider;
};

class InsufficientLiquidityError extends Error {}

const Q192 = 2n ** 192n;
const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
const poolKey = (address: Address) => address.toLowerCase();
type V3BigInt = typeof TickMath.MIN_SQRT_RATIO;
const V3JSBI = TickMath.MIN_SQRT_RATIO.constructor as unknown as {
  BigInt(value: string | number): V3BigInt;
};
const toV3BigInt = (value: bigint | number) => V3JSBI.BigInt(value.toString());
const toBigInt = (value: V3BigInt) => BigInt(value.toString());

function isLiquidityFailure(error: unknown): boolean {
  if (error instanceof InsufficientLiquidityError) return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("liquidity") || message.includes("sqrt") || message.includes("spl");
}

function mostSignificantBit(value: bigint): number {
  let bit = -1;
  for (let remaining = value; remaining > 0n; remaining >>= 1n) bit += 1;
  return bit;
}

function leastSignificantBit(value: bigint): number {
  let bit = 0;
  for (let remaining = value; (remaining & 1n) === 0n; remaining >>= 1n) bit += 1;
  return bit;
}

const MAX_TICK_LOOKUPS_PER_POOL = 48;
const QUOTE_TIMEOUT_MS = 8_000;
const MAX_CL_CANDIDATES = 8;

class LiveTickDataProvider implements TickDataProvider {
  private readonly bitmapCache = new Map<number, bigint>();
  private readonly tickCache = new Map<number, { liquidityNet: string }>();
  private lookups = 0;

  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
    private readonly abi: Abi,
    private readonly blockNumber: bigint,
  ) {}

  private countLookup(): void {
    this.lookups += 1;
    if (this.lookups > MAX_TICK_LOOKUPS_PER_POOL) {
      throw new InsufficientLiquidityError("CL tick walk exceeded the quote budget");
    }
  }

  async getTick(tick: number): Promise<{ liquidityNet: string }> {
    const cached = this.tickCache.get(tick);
    if (cached) return cached;
    this.countLookup();
    const value = (await this.client.readContract({
      address: this.address,
      abi: this.abi,
      functionName: "ticks",
      args: [tick],
      blockNumber: this.blockNumber,
    })) as readonly unknown[];
    if (!Array.isArray(value) || typeof value[1] !== "bigint")
      throw new Error("Pool returned malformed tick state");
    const result = { liquidityNet: value[1].toString() };
    this.tickCache.set(tick, result);
    return result;
  }

  private async bitmap(wordPosition: number): Promise<bigint> {
    const cached = this.bitmapCache.get(wordPosition);
    if (cached !== undefined) return cached;
    this.countLookup();
    const value = await this.client.readContract({
      address: this.address,
      abi: this.abi,
      functionName: "tickBitmap",
      args: [wordPosition],
      blockNumber: this.blockNumber,
    });
    if (typeof value !== "bigint") throw new Error("Pool returned malformed tick bitmap");
    this.bitmapCache.set(wordPosition, value);
    return value;
  }

  async nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number,
  ): Promise<[number, boolean]> {
    const compressed = Math.floor(tick / tickSpacing);
    if (lte) {
      const wordPosition = compressed >> 8;
      const bitPosition = compressed & 255;
      const bitmap = await this.bitmap(wordPosition);
      const masked = bitmap & ((1n << BigInt(bitPosition + 1)) - 1n);
      if (masked === 0n) return [(compressed - bitPosition) * tickSpacing, false];
      return [(compressed - (bitPosition - mostSignificantBit(masked))) * tickSpacing, true];
    }
    const nextCompressed = compressed + 1;
    const wordPosition = nextCompressed >> 8;
    const bitPosition = nextCompressed & 255;
    const bitmap = await this.bitmap(wordPosition);
    const masked = bitmap & (((1n << 256n) - 1n) ^ ((1n << BigInt(bitPosition)) - 1n));
    if (masked === 0n) return [(nextCompressed + (255 - bitPosition)) * tickSpacing, false];
    return [(nextCompressed + (leastSignificantBit(masked) - bitPosition)) * tickSpacing, true];
  }
}

async function readPoolSnapshot(
  client: PublicClient,
  registry: SwapRegistry,
  hop: SwapHop,
  blockNumber: bigint,
): Promise<PoolSnapshot> {
  const pool = registry.pools.find((item) => same(item.address, hop.pool));
  if (!pool) throw new Error("Pool is not in the Mezo CL registry");
  const state = (await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: pool.address, abi: pool.abi, functionName: "slot0" },
      { address: pool.address, abi: pool.abi, functionName: "liquidity" },
    ],
  })) as unknown[];
  const slot0 = state[0] as readonly unknown[];
  if (
    !Array.isArray(slot0) ||
    typeof slot0[0] !== "bigint" ||
    typeof slot0[1] !== "number" ||
    typeof state[1] !== "bigint"
  ) {
    throw new Error("Pool returned malformed live state");
  }

  // Active liquidity may be zero while initialized positions exist beyond an empty tick gap.
  // v3Swap traverses that gap and quoteHop still rejects routes that reach no usable liquidity.
  return {
    token0: pool.token0,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    liquidity: state[1],
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    tickDataProvider: new LiveTickDataProvider(client, pool.address, pool.abi, blockNumber),
  };
}

async function quoteHop(
  snapshot: PoolSnapshot,
  hop: SwapHop,
  type: SwapTradeType,
  amount: bigint,
): Promise<bigint> {
  if (amount <= 0n) throw new InsufficientLiquidityError("A hop produced no executable amount");
  try {
    const result = await v3Swap(
      toV3BigInt(snapshot.fee),
      toV3BigInt(snapshot.sqrtPriceX96),
      snapshot.tick,
      toV3BigInt(snapshot.liquidity),
      snapshot.tickSpacing,
      snapshot.tickDataProvider,
      same(hop.tokenIn, snapshot.token0),
      toV3BigInt(type === "exactInput" ? amount : -amount),
    );
    const reachedPriceLimit =
      toBigInt(result.sqrtRatioX96) ===
      (same(hop.tokenIn, snapshot.token0)
        ? toBigInt(TickMath.MIN_SQRT_RATIO) + 1n
        : toBigInt(TickMath.MAX_SQRT_RATIO) - 1n);
    if (reachedPriceLimit) {
      throw new InsufficientLiquidityError("The route cannot fill the requested amount");
    }
    const calculated = toBigInt(result.amountCalculated);
    const quoted = type === "exactInput" ? -calculated : calculated;
    if (quoted <= 0n) throw new InsufficientLiquidityError("A hop produced no executable output");
    return quoted;
  } catch (error) {
    if (isLiquidityFailure(error))
      throw new InsufficientLiquidityError("The route cannot fill the requested amount");
    throw error;
  }
}

function priceImpactBps(
  hops: readonly SwapHop[],
  snapshots: Map<string, PoolSnapshot>,
  amountIn: bigint,
  amountOut: bigint,
): number | null {
  if (amountIn <= 0n || amountOut <= 0n) return null;
  let numerator = 1n;
  let denominator = 1n;
  for (const hop of hops) {
    const snapshot = snapshots.get(poolKey(hop.pool));
    if (!snapshot) return null;
    const squared = snapshot.sqrtPriceX96 * snapshot.sqrtPriceX96;
    if (same(hop.tokenIn, snapshot.token0)) {
      numerator *= squared;
      denominator *= Q192;
    } else {
      numerator *= Q192;
      denominator *= squared;
    }
  }
  const spotOut = (amountIn * numerator) / denominator;
  if (spotOut <= 0n || amountOut >= spotOut) return 0;
  return Number(((spotOut - amountOut) * 10_000n) / spotOut);
}

async function quoteRoute(
  hops: readonly SwapHop[],
  snapshots: Map<string, PoolSnapshot>,
  tradeType: SwapTradeType,
  amount: bigint,
): Promise<Pick<SwapQuote, "amountIn" | "amountOut" | "priceImpactBps">> {
  let running = amount;
  if (tradeType === "exactInput") {
    for (const hop of hops)
      running = await quoteHop(snapshots.get(poolKey(hop.pool))!, hop, tradeType, running);
    return {
      amountIn: amount,
      amountOut: running,
      priceImpactBps: priceImpactBps(hops, snapshots, amount, running),
    };
  }
  for (const hop of [...hops].reverse())
    running = await quoteHop(snapshots.get(poolKey(hop.pool))!, hop, tradeType, running);
  return {
    amountIn: running,
    amountOut: amount,
    priceImpactBps: priceImpactBps(hops, snapshots, running, amount),
  };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function quoteBestSwapRoute(params: {
  client: PublicClient;
  registry: SwapRegistry;
  tokenIn: Address;
  tokenOut: Address;
  tradeType: SwapTradeType;
  amount: bigint;
  maxHops?: number;
}): Promise<SwapRouteResult> {
  const { client, registry, tokenIn, tokenOut, tradeType, amount } = params;
  if (amount <= 0n)
    return { status: "failed-simulation", reason: "Enter an amount to quote", candidateCount: 0 };
  const maxHops = params.maxHops ?? registry.routing.maxHops;
  const clRoutes = discoverClRoutes(registry.pools, tokenIn, tokenOut, {
    maxHops: Math.min(maxHops, 2),
    maxCandidateRoutes: Math.min(registry.routing.maxCandidateRoutes, MAX_CL_CANDIDATES),
  });
  const basicQuotes = await quoteBasicSwapRoutes({
    client,
    registry,
    tokenIn,
    tokenOut,
    tradeType,
    amount,
  });
  try {
    return await withTimeout(
      quoteBestSwapRouteInner({
        client,
        registry,
        tokenIn,
        tokenOut,
        tradeType,
        amount,
        clRoutes,
        maxHops,
        basicQuotes,
      }),
      QUOTE_TIMEOUT_MS,
      "Quote timed out",
    );
  } catch (error) {
    if (basicQuotes.length > 0) {
      const block = await client.getBlock({ blockTag: "latest" });
      return finishQuote({
        tradeType,
        quoted: basicQuotes.map(toQuotedBasic),
        block,
        registry,
        candidateCount: clRoutes.length + basicQuotes.length,
      });
    }
    const timedOut = error instanceof Error && error.message === "Quote timed out";
    return {
      status: "failed-simulation",
      reason: timedOut
        ? "Quote timed out. Try a smaller amount or another pair."
        : "Unable to read or simulate live pool state",
      candidateCount: clRoutes.length,
    };
  }
}

type QuotedRoute = {
  hops: SwapHop[];
  values: Pick<SwapQuote, "amountIn" | "amountOut" | "priceImpactBps">;
  encodedPath: SwapQuote["encodedPath"];
};

function finishQuote(params: {
  tradeType: SwapTradeType;
  quoted: QuotedRoute[];
  block: { number: bigint; timestamp: bigint };
  registry: SwapRegistry;
  candidateCount: number;
}): SwapRouteResult {
  const quoted = [...params.quoted].sort((a, b) => {
    const left = params.tradeType === "exactInput" ? a.values.amountOut : a.values.amountIn;
    const right = params.tradeType === "exactInput" ? b.values.amountOut : b.values.amountIn;
    if (left === right) return a.hops.length - b.hops.length;
    return params.tradeType === "exactInput" ? (left > right ? -1 : 1) : left < right ? -1 : 1;
  });
  const best = quoted[0]!;
  const expiresAtBlockTimestamp = params.block.timestamp + params.registry.routing.quoteTtlSeconds;
  return {
    status: "success",
    quote: {
      tradeType: params.tradeType,
      ...best.values,
      amountOutMinimum: best.values.amountOut,
      amountInMaximum: best.values.amountIn,
      quotedAtBlockTimestamp: params.block.timestamp,
      expiresAtBlockTimestamp,
      blockNumber: params.block.number,
      encodedPath: hopVenue(best.hops[0]!) === "basic" ? "0x" : best.encodedPath,
      hops: best.hops,
      candidateCount: params.candidateCount,
    },
  };
}

function toQuotedBasic(
  item: Awaited<ReturnType<typeof quoteBasicSwapRoutes>>[number],
): QuotedRoute {
  return {
    hops: [...item.hops],
    values: {
      amountIn: item.amountIn,
      amountOut: item.amountOut,
      priceImpactBps: item.priceImpactBps,
    },
    encodedPath: item.encodedPath,
  };
}

async function quoteBestSwapRouteInner(params: {
  client: PublicClient;
  registry: SwapRegistry;
  tokenIn: Address;
  tokenOut: Address;
  tradeType: SwapTradeType;
  amount: bigint;
  clRoutes: SwapHop[][];
  maxHops: number;
  basicQuotes: Awaited<ReturnType<typeof quoteBasicSwapRoutes>>;
}): Promise<SwapRouteResult> {
  const { client, registry, tokenIn, tokenOut, tradeType, amount, clRoutes, basicQuotes } = params;
  if (clRoutes.length === 0 && basicQuotes.length === 0) {
    const alreadyExpanded = params.clRoutes.some((route) => route.length > 2);
    if (!alreadyExpanded && params.maxHops > 2) {
      const longer = discoverClRoutes(registry.pools, tokenIn, tokenOut, {
        maxHops: params.maxHops,
        maxCandidateRoutes: 4,
      });
      if (longer.length > 0) {
        return quoteBestSwapRouteInner({ ...params, clRoutes: longer });
      }
    }
    return {
      status: "no-route",
      reason: "No Mezo CL or AMM route is registered for this token pair",
      candidateCount: 0,
    };
  }

  const quoted: QuotedRoute[] = basicQuotes.map(toQuotedBasic);
  const block = await client.getBlock({ blockTag: "latest" });
  const hasDirectAmm = basicQuotes.some((item) => item.hops.length === 1);
  if (hasDirectAmm) {
    return finishQuote({
      tradeType,
      quoted,
      block,
      registry,
      candidateCount: clRoutes.length + basicQuotes.length,
    });
  }
  const uniqueClHops = clRoutes
    .flat()
    .filter(
      (hop, index, all) => all.findIndex((candidate) => same(candidate.pool, hop.pool)) === index,
    );
  const snapshotResults = await Promise.allSettled(
    uniqueClHops.map((hop) => readPoolSnapshot(client, registry, hop, block.number)),
  );
  const snapshots = new Map<string, PoolSnapshot>();
  const snapshotErrors = new Map<string, unknown>();
  snapshotResults.forEach((result, index) => {
    const key = poolKey(uniqueClHops[index].pool);
    if (result.status === "fulfilled") snapshots.set(key, result.value);
    else snapshotErrors.set(key, result.reason);
  });

  let liquidityFailures = 0;
  let simulationFailures = 0;
  const clByHops = [1, 2, 3].map((length) => clRoutes.filter((route) => route.length === length));
  for (const group of clByHops) {
    for (const hops of group) {
      const missingSnapshotError = hops
        .map((hop) => snapshotErrors.get(poolKey(hop.pool)))
        .find(Boolean);
      if (missingSnapshotError) {
        if (isLiquidityFailure(missingSnapshotError)) liquidityFailures += 1;
        else simulationFailures += 1;
        continue;
      }
      try {
        const encodedPath = encodeClPath(hops, tradeType);
        const values = await quoteRoute(hops, snapshots, tradeType, amount);
        quoted.push({ hops, values, encodedPath });
      } catch (error) {
        if (isLiquidityFailure(error)) liquidityFailures += 1;
        else simulationFailures += 1;
      }
    }
    if (quoted.length > 0 && group.length > 0 && group[0]?.length === 1) break;
  }

  if (quoted.length === 0) {
    if (liquidityFailures > 0 && simulationFailures === 0) {
      return {
        status: "insufficient-liquidity",
        reason: "Registered routes cannot fill the requested amount",
        candidateCount: clRoutes.length + basicQuotes.length,
      };
    }
    return {
      status: "failed-simulation",
      reason: "Every candidate route failed live quote simulation",
      candidateCount: clRoutes.length + basicQuotes.length,
    };
  }

  const latestBlock = await client.getBlock({ blockTag: "latest" });
  if (
    hasChainTimestampPassed(
      latestBlock.timestamp,
      block.timestamp + registry.routing.quoteTtlSeconds,
    )
  ) {
    return {
      status: "stale-quote",
      reason: "Pool state changed while routes were being evaluated",
      candidateCount: clRoutes.length + basicQuotes.length,
    };
  }
  return finishQuote({
    tradeType,
    quoted,
    block,
    registry,
    candidateCount: clRoutes.length + basicQuotes.length,
  });
}

/** Quotes one explicit route. Prefer quoteBestSwapRoute for user-facing routing. */
export async function quoteSwap(params: {
  client: PublicClient;
  registry: SwapRegistry;
  hops: readonly SwapHop[];
  tradeType: SwapTradeType;
  amount: bigint;
}): Promise<SwapQuote> {
  const { client, registry, hops, tradeType, amount } = params;
  if (amount <= 0n || hops.length === 0) throw new Error("Enter an amount to quote");
  const block = await client.getBlock({ blockTag: "latest" });
  const uniqueHops = hops.filter(
    (hop, index) => hops.findIndex((candidate) => same(candidate.pool, hop.pool)) === index,
  );
  const loaded = await Promise.all(
    uniqueHops.map(
      async (hop) =>
        [poolKey(hop.pool), await readPoolSnapshot(client, registry, hop, block.number)] as const,
    ),
  );
  const snapshots = new Map<string, PoolSnapshot>(loaded);
  const values = await quoteRoute(hops, snapshots, tradeType, amount);
  return {
    tradeType,
    ...values,
    amountOutMinimum: values.amountOut,
    amountInMaximum: values.amountIn,
    quotedAtBlockTimestamp: block.timestamp,
    expiresAtBlockTimestamp: block.timestamp + registry.routing.quoteTtlSeconds,
    blockNumber: block.number,
    encodedPath: encodeClPath(hops, tradeType),
    hops,
    candidateCount: 1,
  };
}
