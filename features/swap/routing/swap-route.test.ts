import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";

import { canBasicRoute, canSwapRoute, hopVenue } from "./find-cl-route";
import { encodeClPath } from "./encode-cl-path";
import { planSwap } from "./plan-swap";
import { getSwapRoutingConfig } from "../registry/swap-registry";
import type { SwapAsset, SwapIntent, SwapQuote, SwapRegistry } from "../domain";

const BTC = "0x7b7C000000000000000000000000000000000000" as Address;
const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" as Address;
const MEZO = "0x7B7c000000000000000000000000000000000001" as Address;
const FACTORY = "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248" as Address;
const ROUTER = "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706" as Address;
const POOL = "0x52e604c44417233b6CcEDDDc0d640A405Caacefb" as Address;
const VE_BTC = "0x6F6f000000000000000000000000000000000001" as Address;
const AV_BTCM = "0x6F6f000000000000000000000000000000000002" as Address;

test("swap routing config exposes a bounded quote timeout", () => {
  const previous = process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS;
  try {
    delete process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS;
    assert.equal(getSwapRoutingConfig().quoteTimeoutMs, 15_000);

    process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS = "2000";
    assert.equal(getSwapRoutingConfig().quoteTimeoutMs, 3_000);

    process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS = "45000";
    assert.equal(getSwapRoutingConfig().quoteTimeoutMs, 45_000);

    process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS = "90000";
    assert.equal(getSwapRoutingConfig().quoteTimeoutMs, 60_000);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS;
    else process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS = previous;
  }
});

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
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n, quoteTimeoutMs: 15_000 },
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
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n, quoteTimeoutMs: 15_000 },
  } as unknown as SwapRegistry;
  const plan = planSwap(intent, registry, quote);
  assert.equal(plan.type, "directBasicSwap");
  if (plan.type !== "directBasicSwap") return;
  assert.equal(plan.routerLabel, "Mezo AMM");
  assert.equal(plan.contractFunction, "swapExactTokensForTokens");
  assert.equal(plan.routerAddress, ROUTER);
});

test("planSwap carries permanent veNFT metadata into Aurove zap routes", () => {
  const veBtcAsset: SwapAsset = {
    id: "venft:vebtc:42",
    chainId: 31612,
    address: VE_BTC,
    executableAddress: AV_BTCM,
    symbol: "veBTC #42",
    name: "veBTC position",
    decimals: 18,
    form: "venft",
    balanceDomain: "wallet",
    balanceKey: "veBTC:42",
    trancheId: 1n,
    variant: 1,
    epochs: 4n,
    wrapperAddress: AV_BTCM,
    tokenId: 42n,
    fixedInputAmount: 1_000_000_000_000_000_000n,
    isPermanent: true,
  };
  const hops = [
    {
      pool: POOL,
      poolKey: "cl:avbtcm-musd",
      tokenIn: AV_BTCM,
      tokenOut: MUSD,
      tickSpacing: 200,
      fee: 500,
    },
  ];
  const quote: SwapQuote = {
    tradeType: "exactInput",
    amountIn: veBtcAsset.fixedInputAmount!,
    amountOut: 50_000_000_000_000_000_000n,
    amountOutMinimum: 49_750_000_000_000_000_000n,
    amountInMaximum: veBtcAsset.fixedInputAmount!,
    priceImpactBps: null,
    quotedAtBlockTimestamp: 1n,
    blockNumber: 1n,
    expiresAtBlockTimestamp: 31n,
    encodedPath: encodeClPath(hops, "exactInput"),
    hops,
    candidateCount: 1,
  };
  const intent: SwapIntent = {
    chainId: 31612,
    account: "0x0000000000000000000000000000000000000009",
    tokenIn: veBtcAsset,
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
    assets: [veBtcAsset, musdAsset],
    pools: [
      {
        key: "cl:avbtcm-musd",
        address: POOL,
        abi: [],
        token0: AV_BTCM,
        token1: MUSD,
        tickSpacing: 200,
        fee: 500,
      },
    ],
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n, quoteTimeoutMs: 15_000 },
  } as unknown as SwapRegistry;

  const plan = planSwap(intent, registry, quote);

  assert.equal(plan.type, "auroveVeNftThenSwap");
  if (plan.type !== "auroveVeNftThenSwap") return;
  assert.deepEqual(plan.veNft, {
    address: VE_BTC,
    tokenId: 42n,
    isPermanent: true,
    totalUnits: veBtcAsset.fixedInputAmount,
    sellUnits: veBtcAsset.fixedInputAmount,
    remainingUnits: 0n,
  });
});

test("planSwap deposits a veNFT then sells only selected tranche units", () => {
  const veBtcAsset: SwapAsset = {
    id: "venft:vebtc:42",
    chainId: 31612,
    address: VE_BTC,
    executableAddress: AV_BTCM,
    symbol: "veBTC #42",
    name: "veBTC position",
    decimals: 18,
    form: "venft",
    balanceDomain: "wallet",
    balanceKey: "veBTC:42",
    trancheId: 65540n,
    variant: 1,
    epochs: 4n,
    wrapperAddress: AV_BTCM,
    tokenId: 42n,
    fixedInputAmount: 1_000_000_000_000_000_000n,
    isPermanent: false,
  };
  const sellUnits = 250_000_000_000_000_000n;
  const hops = [
    {
      pool: POOL,
      poolKey: "cl:avbtcm-musd",
      tokenIn: AV_BTCM,
      tokenOut: MUSD,
      tickSpacing: 200,
      fee: 500,
    },
  ];
  const quote: SwapQuote = {
    tradeType: "exactInput",
    amountIn: sellUnits,
    amountOut: 12_500_000_000_000_000_000n,
    amountOutMinimum: 12_500_000_000_000_000_000n,
    amountInMaximum: sellUnits,
    priceImpactBps: null,
    quotedAtBlockTimestamp: 1n,
    blockNumber: 1n,
    expiresAtBlockTimestamp: 31n,
    encodedPath: encodeClPath(hops, "exactInput"),
    hops,
    candidateCount: 1,
  };
  const account = "0x0000000000000000000000000000000000000009" as Address;
  const intent: SwapIntent = {
    chainId: 31612,
    account,
    tokenIn: veBtcAsset,
    tokenOut: musdAsset,
    tradeType: "exactInput",
    amount: quote.amountIn,
    slippageBps: 50,
    recipient: account,
    deadline: 100n,
  };
  const registry = {
    chainId: 31612,
    revision: "test",
    clRouter: { address: ROUTER, abi: [] },
    auroveRouter: { address: ROUTER, abi: [] },
    ledger: { address: "0x0000000000000000000000000000000000000011" as Address, abi: [] },
    assets: [veBtcAsset, musdAsset],
    pools: [
      {
        key: "cl:avbtcm-musd",
        address: POOL,
        abi: [],
        token0: AV_BTCM,
        token1: MUSD,
        tickSpacing: 200,
        fee: 500,
      },
    ],
    routing: { maxHops: 3, maxCandidateRoutes: 8, quoteTtlSeconds: 30n, quoteTimeoutMs: 15_000 },
  } as unknown as SwapRegistry;

  const plan = planSwap(intent, registry, quote);

  assert.equal(plan.type, "auroveVeNftDepositThenTrancheSwap");
  if (plan.type !== "auroveVeNftDepositThenTrancheSwap") return;
  assert.equal(plan.contractFunction, "depositVeNft + zapTrancheExactInput");
  assert.deepEqual(plan.depositCall.args, [1, 4n, 42n, account]);
  assert.deepEqual(plan.swapCall.args, [65540n, sellUnits, plan.contractCall.args[2]]);
  assert.equal(plan.veNft.totalUnits, veBtcAsset.fixedInputAmount);
  assert.equal(plan.veNft.sellUnits, sellUnits);
  assert.equal(plan.veNft.remainingUnits, 750_000_000_000_000_000n);
  assert.equal(plan.approval.kind, "batch");
  if (plan.approval.kind !== "batch") return;
  assert.deepEqual(
    plan.approval.approvals.map((approval) => approval.kind),
    ["erc721", "erc1155"],
  );
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
