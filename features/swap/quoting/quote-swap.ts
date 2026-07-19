import { Tick, TickListDataProvider, TickMath, v3Swap } from "@uniswap/v3-sdk";
import type { Address, PublicClient } from "viem";
import type { SwapHop, SwapQuote, SwapRegistry, SwapTradeType } from "../domain";

type Result = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
type PoolSnapshot = {
  token0: Address;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  fee: number;
  tickSpacing: number;
  ticks: Tick[];
};

const Q192 = 2n ** 192n;
const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
type V3BigInt = typeof TickMath.MIN_SQRT_RATIO;
const V3JSBI = TickMath.MIN_SQRT_RATIO.constructor as unknown as { BigInt(value: string | number): V3BigInt };
const toV3BigInt = (value: bigint | number) => V3JSBI.BigInt(value.toString());
const toBigInt = (value: V3BigInt) => BigInt(value.toString());

async function readPoolSnapshot(client: PublicClient, registry: SwapRegistry, hop: SwapHop, blockNumber: bigint): Promise<PoolSnapshot> {
  const pool = registry.pools.find((item) => item.address.toLowerCase() === hop.pool.toLowerCase());
  if (!pool) throw new Error("Pool is not in the swap registry");
  const state = await client.multicall({ allowFailure: false, blockNumber, contracts: [
    { address: pool.address, abi: pool.abi, functionName: "slot0" },
    { address: pool.address, abi: pool.abi, functionName: "liquidity" },
  ] }) as unknown[];
  const slot0 = state[0] as readonly unknown[];
  if (!Array.isArray(slot0) || typeof slot0[0] !== "bigint" || typeof slot0[1] !== "number" || typeof state[1] !== "bigint") {
    throw new Error("Pool returned malformed state");
  }
  const minCompressed = Math.floor(TickMath.MIN_TICK / pool.tickSpacing);
  const maxCompressed = Math.floor(TickMath.MAX_TICK / pool.tickSpacing);
  const minWord = Math.floor(minCompressed / 256);
  const maxWord = Math.floor(maxCompressed / 256);
  const words = Array.from({ length: maxWord - minWord + 1 }, (_, index) => minWord + index);
  const bitmaps = await client.multicall({ allowFailure: true, blockNumber, contracts: words.map((word) => ({
    address: pool.address, abi: pool.abi, functionName: "tickBitmap", args: [word],
  })) }) as Result[];
  const initialized: number[] = [];
  bitmaps.forEach((result, wordIndex) => {
    if (result.status !== "success" || typeof result.result !== "bigint") return;
    const bitmap = result.result;
    for (let bit = 0; bit < 256; bit += 1) {
      if ((bitmap & (1n << BigInt(bit))) !== 0n) initialized.push(((words[wordIndex] * 256) + bit) * pool.tickSpacing);
    }
  });
  const tickResults = await client.multicall({ allowFailure: true, blockNumber, contracts: initialized.map((tick) => ({
    address: pool.address, abi: pool.abi, functionName: "ticks", args: [tick],
  })) }) as Result[];
  const ticks = initialized.flatMap((index, resultIndex) => {
    const result = tickResults[resultIndex];
    const value = result?.status === "success" ? result.result : null;
    if (!Array.isArray(value) || typeof value[0] !== "bigint" || typeof value[1] !== "bigint") return [];
    return [new Tick({ index, liquidityGross: value[0].toString(), liquidityNet: value[1].toString() })];
  });
  if (ticks.length === 0) throw new Error("Pool has no initialized liquidity ticks");
  return { token0: pool.token0, sqrtPriceX96: slot0[0], tick: slot0[1], liquidity: state[1], fee: pool.fee, tickSpacing: pool.tickSpacing, ticks };
}

async function quoteHop(snapshot: PoolSnapshot, hop: SwapHop, type: SwapTradeType, amount: bigint): Promise<bigint> {
  const provider = new TickListDataProvider(snapshot.ticks, snapshot.tickSpacing);
  const zeroForOne = same(hop.tokenIn, snapshot.token0);
  const specified = type === "exactInput" ? amount : -amount;
  const result = await v3Swap(
    toV3BigInt(snapshot.fee), toV3BigInt(snapshot.sqrtPriceX96), snapshot.tick,
    toV3BigInt(snapshot.liquidity), snapshot.tickSpacing, provider,
    zeroForOne, toV3BigInt(specified),
  );
  const calculated = toBigInt(result.amountCalculated);
  return type === "exactInput" ? -calculated : calculated;
}

function priceImpactBps(hops: readonly SwapHop[], snapshots: Map<Address, PoolSnapshot>, amountIn: bigint, amountOut: bigint): number | null {
  if (amountIn <= 0n || amountOut <= 0n) return null;
  let numerator = 1n;
  let denominator = 1n;
  for (const hop of hops) {
    const snapshot = snapshots.get(hop.pool);
    if (!snapshot) return null;
    const squared = snapshot.sqrtPriceX96 * snapshot.sqrtPriceX96;
    if (same(hop.tokenIn, snapshot.token0)) { numerator *= squared; denominator *= Q192; }
    else { numerator *= Q192; denominator *= squared; }
  }
  const spotOut = amountIn * numerator / denominator;
  if (spotOut <= 0n || amountOut >= spotOut) return 0;
  return Number(((spotOut - amountOut) * 10_000n) / spotOut);
}

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
  const blockNumber = block.number;
  const uniqueHops = hops.filter((hop, index) => hops.findIndex((candidate) => candidate.pool === hop.pool) === index);
  const loaded = await Promise.all(uniqueHops.map(async (hop) => [hop.pool, await readPoolSnapshot(client, registry, hop, blockNumber)] as const));
  const snapshots = new Map<Address, PoolSnapshot>(loaded);
  let running = amount;
  if (tradeType === "exactInput") {
    for (const hop of hops) running = await quoteHop(snapshots.get(hop.pool)!, hop, "exactInput", running);
    return { tradeType, amountIn: amount, amountOut: running, amountOutMinimum: running, amountInMaximum: amount, priceImpactBps: priceImpactBps(hops, snapshots, amount, running), quotedAtBlockTimestamp: block.timestamp, blockNumber };
  }
  for (const hop of [...hops].reverse()) running = await quoteHop(snapshots.get(hop.pool)!, hop, "exactOutput", running);
  return { tradeType, amountIn: running, amountOut: amount, amountOutMinimum: amount, amountInMaximum: running, priceImpactBps: priceImpactBps(hops, snapshots, running, amount), quotedAtBlockTimestamp: block.timestamp, blockNumber };
}
