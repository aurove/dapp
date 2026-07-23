import { TickMath, v3Swap, type TickDataProvider } from "@uniswap/v3-sdk";
import type { Abi, Address, PublicClient } from "viem";
import type { SwapHop, SwapQuote, SwapRegistry, SwapRouteResult, SwapTradeType } from "../domain";
import { discoverClRoutes, encodeClPath } from "../routing";

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
const V3JSBI = TickMath.MIN_SQRT_RATIO.constructor as unknown as { BigInt(value: string | number): V3BigInt };
const toV3BigInt = (value: bigint | number) => V3JSBI.BigInt(value.toString());
const toBigInt = (value: V3BigInt) => BigInt(value.toString());

function isLiquidityFailure(error: unknown): boolean {
  if (error instanceof InsufficientLiquidityError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
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

class LiveTickDataProvider implements TickDataProvider {
  private readonly bitmapCache = new Map<number, bigint>();
  private readonly tickCache = new Map<number, { liquidityNet: string }>();

  constructor(
    private readonly client: PublicClient,
    private readonly address: Address,
    private readonly abi: Abi,
    private readonly blockNumber: bigint,
  ) {}

  async getTick(tick: number): Promise<{ liquidityNet: string }> {
    const cached = this.tickCache.get(tick);
    if (cached) return cached;
    const value = await this.client.readContract({
      address: this.address, abi: this.abi, functionName: "ticks", args: [tick], blockNumber: this.blockNumber,
    }) as readonly unknown[];
    if (!Array.isArray(value) || typeof value[1] !== "bigint") throw new Error("Pool returned malformed tick state");
    const result = { liquidityNet: value[1].toString() };
    this.tickCache.set(tick, result);
    return result;
  }

  private async bitmap(wordPosition: number): Promise<bigint> {
    const cached = this.bitmapCache.get(wordPosition);
    if (cached !== undefined) return cached;
    const value = await this.client.readContract({
      address: this.address, abi: this.abi, functionName: "tickBitmap", args: [wordPosition], blockNumber: this.blockNumber,
    });
    if (typeof value !== "bigint") throw new Error("Pool returned malformed tick bitmap");
    this.bitmapCache.set(wordPosition, value);
    return value;
  }

  async nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number): Promise<[number, boolean]> {
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

async function readPoolSnapshot(client: PublicClient, registry: SwapRegistry, hop: SwapHop, blockNumber: bigint): Promise<PoolSnapshot> {
  const pool = registry.pools.find((item) => same(item.address, hop.pool));
  if (!pool) throw new Error("Pool is not in the Mezo CL registry");
  const state = await client.multicall({ allowFailure: false, blockNumber, contracts: [
    { address: pool.address, abi: pool.abi, functionName: "slot0" },
    { address: pool.address, abi: pool.abi, functionName: "liquidity" },
  ] }) as unknown[];
  const slot0 = state[0] as readonly unknown[];
  if (!Array.isArray(slot0) || typeof slot0[0] !== "bigint" || typeof slot0[1] !== "number" || typeof state[1] !== "bigint") {
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

async function quoteHop(snapshot: PoolSnapshot, hop: SwapHop, type: SwapTradeType, amount: bigint): Promise<bigint> {
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
    const reachedPriceLimit = toBigInt(result.sqrtRatioX96) === (
      same(hop.tokenIn, snapshot.token0)
        ? toBigInt(TickMath.MIN_SQRT_RATIO) + 1n
        : toBigInt(TickMath.MAX_SQRT_RATIO) - 1n
    );
    if (reachedPriceLimit) {
      throw new InsufficientLiquidityError("The route cannot fill the requested amount");
    }
    const calculated = toBigInt(result.amountCalculated);
    const quoted = type === "exactInput" ? -calculated : calculated;
    if (quoted <= 0n) throw new InsufficientLiquidityError("A hop produced no executable output");
    return quoted;
  } catch (error) {
    if (isLiquidityFailure(error)) throw new InsufficientLiquidityError("The route cannot fill the requested amount");
    throw error;
  }
}

function priceImpactBps(hops: readonly SwapHop[], snapshots: Map<string, PoolSnapshot>, amountIn: bigint, amountOut: bigint): number | null {
  if (amountIn <= 0n || amountOut <= 0n) return null;
  let numerator = 1n;
  let denominator = 1n;
  for (const hop of hops) {
    const snapshot = snapshots.get(poolKey(hop.pool));
    if (!snapshot) return null;
    const squared = snapshot.sqrtPriceX96 * snapshot.sqrtPriceX96;
    if (same(hop.tokenIn, snapshot.token0)) { numerator *= squared; denominator *= Q192; }
    else { numerator *= Q192; denominator *= squared; }
  }
  const spotOut = amountIn * numerator / denominator;
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
    for (const hop of hops) running = await quoteHop(snapshots.get(poolKey(hop.pool))!, hop, tradeType, running);
    return { amountIn: amount, amountOut: running, priceImpactBps: priceImpactBps(hops, snapshots, amount, running) };
  }
  for (const hop of [...hops].reverse()) running = await quoteHop(snapshots.get(poolKey(hop.pool))!, hop, tradeType, running);
  return { amountIn: running, amountOut: amount, priceImpactBps: priceImpactBps(hops, snapshots, running, amount) };
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
  if (amount <= 0n) return { status: "failed-simulation", reason: "Enter an amount to quote", candidateCount: 0 };
  const routes = discoverClRoutes(registry.pools, tokenIn, tokenOut, {
    maxHops: params.maxHops ?? registry.routing.maxHops,
    maxCandidateRoutes: registry.routing.maxCandidateRoutes,
  });
  if (routes.length === 0) return { status: "no-route", reason: "No route is registered for this token pair", candidateCount: 0 };

  try {
    const block = await client.getBlock({ blockTag: "latest" });
    const uniqueHops = routes.flat().filter((hop, index, all) => all.findIndex((candidate) => same(candidate.pool, hop.pool)) === index);
    const snapshotResults = await Promise.allSettled(uniqueHops.map((hop) => readPoolSnapshot(client, registry, hop, block.number)));
    const snapshots = new Map<string, PoolSnapshot>();
    const snapshotErrors = new Map<string, unknown>();
    snapshotResults.forEach((result, index) => {
      const key = poolKey(uniqueHops[index].pool);
      if (result.status === "fulfilled") snapshots.set(key, result.value);
      else snapshotErrors.set(key, result.reason);
    });

    const quoted: Array<{ hops: SwapHop[]; values: Pick<SwapQuote, "amountIn" | "amountOut" | "priceImpactBps"> }> = [];
    let liquidityFailures = 0;
    let simulationFailures = 0;
    for (const hops of routes) {
      const missingSnapshotError = hops.map((hop) => snapshotErrors.get(poolKey(hop.pool))).find(Boolean);
      if (missingSnapshotError) {
        if (isLiquidityFailure(missingSnapshotError)) liquidityFailures += 1;
        else simulationFailures += 1;
        continue;
      }
      try {
        encodeClPath(hops, tradeType);
        const values = await quoteRoute(hops, snapshots, tradeType, amount);
        quoted.push({ hops, values });
      } catch (error) {
        if (isLiquidityFailure(error)) liquidityFailures += 1;
        else simulationFailures += 1;
      }
    }
    if (quoted.length === 0) {
      if (liquidityFailures > 0 && simulationFailures === 0) {
        return { status: "insufficient-liquidity", reason: "Registered routes cannot fill the requested amount", candidateCount: routes.length };
      }
      return { status: "failed-simulation", reason: "Every candidate route failed live quote simulation", candidateCount: routes.length };
    }

    quoted.sort((a, b) => {
      const left = tradeType === "exactInput" ? a.values.amountOut : a.values.amountIn;
      const right = tradeType === "exactInput" ? b.values.amountOut : b.values.amountIn;
      if (left === right) return a.hops.length - b.hops.length;
      return tradeType === "exactInput" ? (left > right ? -1 : 1) : (left < right ? -1 : 1);
    });
    const best = quoted[0];
    const latestBlock = await client.getBlock({ blockTag: "latest" });
    const expiresAtBlockTimestamp = block.timestamp + registry.routing.quoteTtlSeconds;
    if (latestBlock.timestamp > expiresAtBlockTimestamp) {
      return { status: "stale-quote", reason: "Pool state changed while routes were being evaluated", candidateCount: routes.length };
    }
    return {
      status: "success",
      quote: {
        tradeType,
        ...best.values,
        amountOutMinimum: best.values.amountOut,
        amountInMaximum: best.values.amountIn,
        quotedAtBlockTimestamp: block.timestamp,
        expiresAtBlockTimestamp,
        blockNumber: block.number,
        encodedPath: encodeClPath(best.hops, tradeType),
        hops: best.hops,
        candidateCount: routes.length,
      },
    };
  } catch {
    return { status: "failed-simulation", reason: "Unable to read or simulate live CL pool state", candidateCount: routes.length };
  }
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
  const uniqueHops = hops.filter((hop, index) => hops.findIndex((candidate) => same(candidate.pool, hop.pool)) === index);
  const loaded = await Promise.all(uniqueHops.map(async (hop) => [poolKey(hop.pool), await readPoolSnapshot(client, registry, hop, block.number)] as const));
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
