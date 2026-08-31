import type { Address, PublicClient } from "viem";
import { MEZO_BASIC_ROUTER_ABI } from "@/lib/config/mezo-amm";
import { getKnownMezoTokenConfigs } from "@/components/shared/known-mezo-tokens";
import type { SwapHop, SwapQuote, SwapRegistry, SwapTradeType } from "../domain";

export type BasicQuote = Pick<
  SwapQuote,
  "amountIn" | "amountOut" | "priceImpactBps" | "encodedPath" | "hops"
>;

const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

type BasicRouteHop = {
  from: Address;
  to: Address;
  stable: boolean;
  factory: Address;
};

function poolForPair(registry: SwapRegistry, tokenA: Address, tokenB: Address) {
  return (registry.basicPools ?? []).filter((pool) => {
    const tokens = new Set([pool.token0.toLowerCase(), pool.token1.toLowerCase()]);
    return tokens.has(tokenA.toLowerCase()) && tokens.has(tokenB.toLowerCase());
  });
}

function candidateBasicRoutes(
  registry: SwapRegistry,
  tokenIn: Address,
  tokenOut: Address,
): BasicRouteHop[][] {
  if (!registry.basicRouter || same(tokenIn, tokenOut)) return [];
  const factory = registry.basicRouter.factory;
  const direct = poolForPair(registry, tokenIn, tokenOut).map((pool) => [
    { from: tokenIn, to: tokenOut, stable: pool.stable, factory },
  ]);
  const knownMids = getKnownMezoTokenConfigs(registry.chainId).map((token) => token.address);
  const extraMids = (registry.basicPools ?? []).flatMap((pool) => [pool.token0, pool.token1]);
  const mids = [
    ...new Map(
      [...knownMids, ...extraMids].map((address) => [address.toLowerCase(), address]),
    ).values(),
  ].filter((mid) => !same(mid, tokenIn) && !same(mid, tokenOut));
  const twoHop = mids.flatMap((mid) => {
    const firstLegs = poolForPair(registry, tokenIn, mid);
    const secondLegs = poolForPair(registry, mid, tokenOut);
    return firstLegs.flatMap((first) =>
      secondLegs.map((second) => [
        { from: tokenIn, to: mid, stable: first.stable, factory },
        { from: mid, to: tokenOut, stable: second.stable, factory },
      ]),
    );
  });
  return [...direct, ...twoHop].slice(0, 8);
}

function toHops(route: BasicRouteHop[]): SwapHop[] {
  return route.map((hop) => ({
    pool: hop.factory,
    poolKey: `basic:${hop.from.toLowerCase()}:${hop.to.toLowerCase()}:${hop.stable ? "stable" : "volatile"}`,
    tokenIn: hop.from,
    tokenOut: hop.to,
    tickSpacing: 0,
    fee: hop.stable ? 100 : 30,
    venue: "basic" as const,
    stable: hop.stable,
    factory: hop.factory,
  }));
}

export async function quoteBasicSwapRoutes(params: {
  client: PublicClient;
  registry: SwapRegistry;
  tokenIn: Address;
  tokenOut: Address;
  tradeType: SwapTradeType;
  amount: bigint;
}): Promise<BasicQuote[]> {
  const router = params.registry.basicRouter;
  if (!router || params.amount <= 0n) return [];
  const routes = candidateBasicRoutes(params.registry, params.tokenIn, params.tokenOut);
  const quoted = await Promise.all(
    routes.map(async (route) => {
      try {
        const functionName = params.tradeType === "exactInput" ? "getAmountsOut" : "getAmountsIn";
        const amounts = await params.client.readContract({
          address: router.address,
          abi: MEZO_BASIC_ROUTER_ABI,
          functionName,
          args: [params.amount, route],
        });
        if (!Array.isArray(amounts) || amounts.length < 2) return null;
        const amountIn = params.tradeType === "exactInput" ? params.amount : (amounts[0] as bigint);
        const amountOut =
          params.tradeType === "exactInput"
            ? (amounts[amounts.length - 1] as bigint)
            : params.amount;
        if (
          typeof amountIn !== "bigint" ||
          typeof amountOut !== "bigint" ||
          amountIn <= 0n ||
          amountOut <= 0n
        ) {
          return null;
        }
        const hops = toHops(route);
        return {
          amountIn,
          amountOut,
          priceImpactBps: null,
          encodedPath: "0x" as const,
          hops,
        } satisfies BasicQuote;
      } catch {
        return null;
      }
    }),
  );
  return quoted.flatMap((item) => (item ? [item] : []));
}
