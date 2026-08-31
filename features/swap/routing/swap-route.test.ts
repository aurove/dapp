import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";

import { canBasicRoute, canSwapRoute, hopVenue } from "./find-cl-route";
import { planSwap } from "./plan-swap";
import type { SwapAsset, SwapIntent, SwapQuote, SwapRegistry } from "../domain";

const BTC = "0x7b7C000000000000000000000000000000000000" as Address;
const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" as Address;
const MEZO = "0x7B7c000000000000000000000000000000000001" as Address;
const FACTORY = "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248" as Address;
const ROUTER = "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706" as Address;
const POOL = "0x52e604c44417233b6CcEDDDc0d640A405Caacefb" as Address;

const btcAsset: SwapAsset = {
  id: "erc20:BTC",
  chainId: 31612,
  address: BTC,
  executableAddress: BTC,
  symbol: "BTC",
  name: "BTC",
  decimals: 18,
  form: "erc20",
  balanceDomain: "wallet",
  balanceKey: "BTC",
};

const musdAsset: SwapAsset = {
  id: "erc20:MUSD",
  chainId: 31612,
  address: MUSD,
  executableAddress: MUSD,
  symbol: "MUSD",
  name: "Mezo USD",
  decimals: 18,
  form: "erc20",
  balanceDomain: "wallet",
  balanceKey: "MUSD",
};

test("canBasicRoute finds direct and two-hop Mezo AMM pairs", () => {
  const pools = [
    {
      key: "btc-musd",
      address: POOL,
      token0: BTC,
      token1: MUSD,
      stable: false,
      factory: FACTORY,
    },
    {
      key: "btc-mezo",
      address: "0x0000000000000000000000000000000000000001" as Address,
      token0: BTC,
      token1: MEZO,
      stable: false,
      factory: FACTORY,
    },
    {
      key: "mezo-musd",
      address: "0x0000000000000000000000000000000000000002" as Address,
      token0: MEZO,
      token1: MUSD,
      stable: false,
      factory: FACTORY,
    },
  ];
  assert.equal(canBasicRoute(pools, BTC, MUSD), true);
  assert.equal(canBasicRoute(pools.slice(1), BTC, MUSD), true);
  assert.equal(canBasicRoute([], BTC, MUSD), false);
});

test("canSwapRoute uses AMM when no CL path exists", () => {
  const registry = {
    pools: [],
    basicPools: [
      {
        key: "btc-musd",
        address: POOL,
        token0: BTC,
        token1: MUSD,
        stable: false,
        factory: FACTORY,
      },
    ],
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n },
  };
  assert.equal(canSwapRoute(registry, BTC, MUSD), true);
  assert.equal(canSwapRoute({ ...registry, basicPools: [] }, BTC, MUSD), false);
});

test("planSwap builds a Mezo AMM execution plan for BTC to MUSD", () => {
  const hops = [
    {
      pool: FACTORY,
      poolKey: "basic:btc-musd",
      tokenIn: BTC,
      tokenOut: MUSD,
      tickSpacing: 0,
      fee: 30,
      venue: "basic" as const,
      stable: false,
      factory: FACTORY,
    },
  ];
  const quote: SwapQuote = {
    tradeType: "exactInput",
    amountIn: 1_000_000_000_000_000_000n,
    amountOut: 50_000_000_000_000_000_000n,
    amountOutMinimum: 50_000_000_000_000_000_000n,
    amountInMaximum: 1_000_000_000_000_000_000n,
    priceImpactBps: null,
    quotedAtBlockTimestamp: 1n,
    blockNumber: 1n,
    expiresAtBlockTimestamp: 31n,
    encodedPath: "0x",
    hops,
    candidateCount: 1,
  };
  const intent: SwapIntent = {
    chainId: 31612,
    account: "0x0000000000000000000000000000000000000009",
    tokenIn: btcAsset,
    tokenOut: musdAsset,
    tradeType: "exactInput",
    amount: quote.amountIn,
    slippageBps: 50,
    recipient: "0x0000000000000000000000000000000000000009",
    deadline: 100n,
  };
  const registry = {
    chainId: 31612,
    revision: "test",
    clRouter: { address: ROUTER, abi: [] },
    auroveRouter: { address: ROUTER, abi: [] },
    ledger: { address: ROUTER, abi: [] },
    basicRouter: { address: ROUTER, factory: FACTORY, abi: [] },
    assets: [btcAsset, musdAsset],
    pools: [],
    basicPools: [
      {
        key: "btc-musd",
        address: POOL,
        token0: BTC,
        token1: MUSD,
        stable: false,
        factory: FACTORY,
      },
    ],
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n },
  } as unknown as SwapRegistry;
  const plan = planSwap(intent, registry, quote);
  assert.equal(plan.type, "directBasicSwap");
  if (plan.type !== "directBasicSwap") return;
  assert.equal(plan.routerLabel, "Mezo AMM");
  assert.equal(plan.contractFunction, "swapExactTokensForTokens");
  assert.equal(plan.routerAddress, ROUTER);
});

test("hopVenue defaults CL hops", () => {
  assert.equal(
    hopVenue({
      pool: POOL,
      poolKey: "cl",
      tokenIn: BTC,
      tokenOut: MUSD,
      tickSpacing: 200,
      fee: 500,
    }),
    "cl",
  );
});
