import type { Address } from "viem";
import type { SwapHop, SwapPool } from "../domain";

const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

export function findClRoute(pools: readonly SwapPool[], tokenIn: Address, tokenOut: Address): SwapHop[] | null {
  if (same(tokenIn, tokenOut)) return null;
  const adjacent = (token: Address) => pools.flatMap((pool) => {
    if (same(pool.token0, token)) return [{ pool, next: pool.token1 }];
    if (same(pool.token1, token)) return [{ pool, next: pool.token0 }];
    return [];
  });
  const toHop = (pool: SwapPool, from: Address, to: Address): SwapHop => ({
    pool: pool.address, poolKey: pool.key, tokenIn: from, tokenOut: to,
    tickSpacing: pool.tickSpacing, fee: pool.fee,
  });
  const queue: Array<{ token: Address; hops: SwapHop[]; visited: Set<string> }> = [{ token: tokenIn, hops: [], visited: new Set([tokenIn.toLowerCase()]) }];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of adjacent(current.token)) {
      const normalized = edge.next.toLowerCase();
      if (current.visited.has(normalized)) continue;
      const hops = [...current.hops, toHop(edge.pool, current.token, edge.next)];
      if (same(edge.next, tokenOut)) return hops;
      queue.push({ token: edge.next, hops, visited: new Set([...current.visited, normalized]) });
    }
  }
  return null;
}

export function canRoute(pools: readonly SwapPool[], tokenIn: Address, tokenOut: Address): boolean {
  return findClRoute(pools, tokenIn, tokenOut) !== null;
}
