import type { Address } from "viem";
import type { SwapBasicPool, SwapHop, SwapPool, SwapRegistry, SwapVenue } from "../domain";

const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

export interface ClPoolGraphEdge {
  pool: SwapPool;
  tokenIn: Address;
  tokenOut: Address;
}

export type ClPoolGraph = ReadonlyMap<string, readonly ClPoolGraphEdge[]>;

export interface ClRouteDiscoveryOptions {
  maxHops?: number;
  maxCandidateRoutes?: number;
}

const DEFAULT_MAX_HOPS = 3;
const DEFAULT_MAX_CANDIDATE_ROUTES = 64;

export function buildClPoolGraph(pools: readonly SwapPool[]): ClPoolGraph {
  const graph = new Map<string, ClPoolGraphEdge[]>();
  const append = (tokenIn: Address, tokenOut: Address, pool: SwapPool) => {
    const key = tokenIn.toLowerCase();
    graph.set(key, [...(graph.get(key) ?? []), { pool, tokenIn, tokenOut }]);
  };
  for (const pool of pools) {
    if (same(pool.token0, pool.token1) || pool.tickSpacing <= 0 || pool.fee < 0) continue;
    append(pool.token0, pool.token1, pool);
    append(pool.token1, pool.token0, pool);
  }
  return graph;
}

function toHop(edge: ClPoolGraphEdge): SwapHop {
  return {
    pool: edge.pool.address,
    poolKey: edge.pool.key,
    tokenIn: edge.tokenIn,
    tokenOut: edge.tokenOut,
    tickSpacing: edge.pool.tickSpacing,
    fee: edge.pool.fee,
  };
}

export function discoverClRoutes(
  pools: readonly SwapPool[],
  tokenIn: Address,
  tokenOut: Address,
  options: ClRouteDiscoveryOptions = {},
): SwapHop[][] {
  if (same(tokenIn, tokenOut)) return [];
  const maxHops = Math.max(1, Math.floor(options.maxHops ?? DEFAULT_MAX_HOPS));
  const maxCandidateRoutes = Math.max(
    1,
    Math.floor(options.maxCandidateRoutes ?? DEFAULT_MAX_CANDIDATE_ROUTES),
  );
  const graph = buildClPoolGraph(pools);
  const routes: SwapHop[][] = [];
  const queue: Array<{
    token: Address;
    hops: SwapHop[];
    visitedTokens: Set<string>;
    visitedPools: Set<string>;
  }> = [
    {
      token: tokenIn,
      hops: [],
      visitedTokens: new Set([tokenIn.toLowerCase()]),
      visitedPools: new Set(),
    },
  ];

  while (queue.length > 0 && routes.length < maxCandidateRoutes) {
    const current = queue.shift()!;
    if (current.hops.length >= maxHops) continue;
    for (const edge of graph.get(current.token.toLowerCase()) ?? []) {
      const nextToken = edge.tokenOut.toLowerCase();
      const poolAddress = edge.pool.address.toLowerCase();
      if (current.visitedTokens.has(nextToken) || current.visitedPools.has(poolAddress)) continue;
      const nextHops = [...current.hops, toHop(edge)];
      if (same(edge.tokenOut, tokenOut)) {
        routes.push(nextHops);
        if (routes.length >= maxCandidateRoutes) break;
        continue;
      }
      queue.push({
        token: edge.tokenOut,
        hops: nextHops,
        visitedTokens: new Set([...current.visitedTokens, nextToken]),
        visitedPools: new Set([...current.visitedPools, poolAddress]),
      });
    }
  }

  return routes;
}

export function findClRoute(
  pools: readonly SwapPool[],
  tokenIn: Address,
  tokenOut: Address,
  maxHops = DEFAULT_MAX_HOPS,
): SwapHop[] | null {
  return discoverClRoutes(pools, tokenIn, tokenOut, { maxHops, maxCandidateRoutes: 1 })[0] ?? null;
}

export function canRoute(
  pools: readonly SwapPool[],
  tokenIn: Address,
  tokenOut: Address,
  maxHops = DEFAULT_MAX_HOPS,
): boolean {
  return findClRoute(pools, tokenIn, tokenOut, maxHops) !== null;
}

export function hopVenue(hop: SwapHop): SwapVenue {
  return hop.venue ?? "cl";
}

export function canBasicRoute(
  basicPools: readonly SwapBasicPool[] | undefined,
  tokenIn: Address,
  tokenOut: Address,
): boolean {
  if (!basicPools?.length || same(tokenIn, tokenOut)) return false;
  const inKey = tokenIn.toLowerCase();
  const outKey = tokenOut.toLowerCase();
  const pairExists = (left: string, right: string) =>
    basicPools.some((pool) => {
      const tokens = new Set([pool.token0.toLowerCase(), pool.token1.toLowerCase()]);
      return tokens.has(left) && tokens.has(right);
    });
  if (pairExists(inKey, outKey)) return true;
  const mids = basicPools.flatMap((pool) => {
    const token0 = pool.token0.toLowerCase();
    const token1 = pool.token1.toLowerCase();
    if (token0 === inKey) return [token1];
    if (token1 === inKey) return [token0];
    return [];
  });
  return mids.some((mid) => mid !== outKey && pairExists(mid, outKey));
}

export function canSwapRoute(
  registry: Pick<SwapRegistry, "pools" | "basicPools" | "routing">,
  tokenIn: Address,
  tokenOut: Address,
): boolean {
  return (
    canRoute(registry.pools, tokenIn, tokenOut, registry.routing.maxHops) ||
    canBasicRoute(registry.basicPools, tokenIn, tokenOut)
  );
}
