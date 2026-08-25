import assert from "node:assert/strict";
import test from "node:test";
import type { Abi, Address, PublicClient } from "viem";

import { executePreparedWriteStep } from "@/lib/tx-flow/execute";
import { makeAddressWriteStep } from "@/lib/tx-flow/steps";
import type { TxFlowRuntimeContext, TxPreparedWriteStep } from "@/lib/tx-flow/types";
import {
  getDisplayPriceOrientation,
  getDisplayPriceRangeTicks,
  getTickPrice,
  type SlipstreamPoolState,
} from "./slipstream-adapter";
import {
  decodeInitializedTicksFromBitmap,
  fetchSlipstreamLiquidityDepth,
  reconstructSlipstreamLiquidity,
  scaleLiquidityForChart,
  SlipstreamLiquidityDataError,
  type SlipstreamInitializedTick,
} from "./slipstream-liquidity-depth";
import { slipstreamLiquidityDepthKeys } from "./slipstream-liquidity-depth-keys";

const POOL = "0x0000000000000000000000000000000000000001" as Address;
const TOKEN_0 = "0x0000000000000000000000000000000000000002" as Address;
const TOKEN_1 = "0x0000000000000000000000000000000000000003" as Address;

function initialized(
  tick: number,
  liquidityNet: bigint,
  liquidityGross = liquidityNet < 0n ? -liquidityNet : liquidityNet,
): SlipstreamInitializedTick {
  return { tick, liquidityNet, liquidityGross };
}

function reconstruct(params: {
  ticks: SlipstreamInitializedTick[];
  currentTick: number;
  activeLiquidity: bigint;
  complete?: boolean;
}) {
  return reconstructSlipstreamLiquidity({
    initializedTicks: params.ticks,
    currentTick: params.currentTick,
    activeLiquidity: params.activeLiquidity,
    tickSpacing: 10,
    coverage: { tickLower: -100, tickUpper: 100 },
    complete: params.complete ?? true,
  });
}

test("reconstructs one position as constant active liquidity between its initialized ticks", () => {
  const result = reconstruct({
    ticks: [initialized(-20, 100n), initialized(20, -100n)],
    currentTick: 0,
    activeLiquidity: 100n,
  });

  assert.deepEqual(result.intervals, [
    { tickLower: -100, tickUpper: -20, liquidity: 0n },
    { tickLower: -20, tickUpper: 20, liquidity: 100n },
    { tickLower: 20, tickUpper: 100, liquidity: 0n },
  ]);
});

test("reconstructs multiple overlapping positions above and below the current tick", () => {
  const result = reconstruct({
    ticks: [
      initialized(-30, 100n),
      initialized(-10, 40n),
      initialized(30, -100n),
      initialized(50, -40n),
    ],
    currentTick: 0,
    activeLiquidity: 140n,
  });

  assert.deepEqual(
    result.intervals.map(({ tickLower, tickUpper, liquidity }) => [
      tickLower,
      tickUpper,
      liquidity,
    ]),
    [
      [-100, -30, 0n],
      [-30, -10, 100n],
      [-10, 30, 140n],
      [30, 50, 40n],
      [50, 100, 0n],
    ],
  );
});

test("preserves zero-liquidity gaps between disjoint positions", () => {
  const result = reconstruct({
    ticks: [
      initialized(-40, 70n),
      initialized(-20, -70n),
      initialized(20, 90n),
      initialized(40, -90n),
    ],
    currentTick: 0,
    activeLiquidity: 0n,
  });

  assert.equal(
    result.intervals.find(({ tickLower, tickUpper }) => tickLower === -20 && tickUpper === 20)
      ?.liquidity,
    0n,
  );
  assert.equal(result.intervals.find(({ tickLower }) => tickLower === -40)?.liquidity, 70n);
  assert.equal(result.intervals.find(({ tickLower }) => tickLower === 20)?.liquidity, 90n);
});

test("applies liquidityNet upwards and its inverse while reconstructing downwards", () => {
  const result = reconstruct({
    ticks: [
      initialized(-50, 80n),
      initialized(-10, 30n, 50n),
      initialized(20, -60n, 70n),
      initialized(60, -50n),
    ],
    currentTick: 0,
    activeLiquidity: 110n,
  });

  assert.equal(result.intervals.find(({ tickLower }) => tickLower === -50)?.liquidity, 80n);
  assert.equal(result.intervals.find(({ tickLower }) => tickLower === -10)?.liquidity, 110n);
  assert.equal(result.intervals.find(({ tickLower }) => tickLower === 20)?.liquidity, 50n);
  assert.equal(result.intervals.find(({ tickLower }) => tickLower === 60)?.liquidity, 0n);
});

test("uses real decimals and reciprocal orientation without changing underlying liquidity", () => {
  const pool: SlipstreamPoolState = {
    chainId: 1,
    address: POOL,
    token0: { address: TOKEN_0, decimals: 18, symbol: "MUSD", name: "MUSD" },
    token1: { address: TOKEN_1, decimals: 8, symbol: "BTC", name: "BTC" },
    currentTick: 0,
    sqrtPriceX96: 1n << 96n,
    tickSpacing: 10,
  };
  const rawPrice = getTickPrice({ pool, tick: 0, invert: false });
  const inversePrice = getTickPrice({ pool, tick: 0, invert: true });
  assert.equal(rawPrice?.toFixed(0), "10000000000");
  assert.equal(inversePrice?.toFixed(12), "0.000000000100");
  assert.equal(getDisplayPriceOrientation(pool).inverted, true);
  assert.deepEqual(getDisplayPriceRangeTicks(pool, { tickLower: -10, tickUpper: 20 }), {
    lowTick: 20,
    highTick: -10,
  });

  const liquidity = reconstruct({
    ticks: [initialized(-10, 2n ** 100n), initialized(20, -(2n ** 100n))],
    currentTick: 0,
    activeLiquidity: 2n ** 100n,
  }).intervals;
  assert.equal(liquidity.find(({ tickLower }) => tickLower === -10)?.liquidity, 2n ** 100n);
});

test("supports extreme ticks and very large liquidity without unsafe number conversion", () => {
  const huge = 2n ** 120n;
  const result = reconstructSlipstreamLiquidity({
    initializedTicks: [initialized(-887272, huge), initialized(887272, -huge)],
    currentTick: 887000,
    activeLiquidity: huge,
    tickSpacing: 1,
    coverage: { tickLower: -887272, tickUpper: 887272 },
    complete: true,
  });
  assert.equal(result.intervals[0].liquidity, huge);
  assert.equal(scaleLiquidityForChart(huge, huge), 1_000_000);
  assert.equal(scaleLiquidityForChart(huge / 2n, huge), 500_000);
});

test("surfaces partial and invalid data instead of fabricating liquidity", () => {
  const partial = reconstruct({
    ticks: [initialized(-20, 100n), initialized(20, -100n)],
    currentTick: 0,
    activeLiquidity: 100n,
    complete: false,
  });
  assert.match(partial.validationWarnings[0], /part/i);

  assert.throws(
    () =>
      reconstruct({
        ticks: [initialized(-20, 100n), initialized(20, -100n)],
        currentTick: 0,
        activeLiquidity: 101n,
      }),
    (error: unknown) =>
      error instanceof SlipstreamLiquidityDataError && /pool\.liquidity/i.test(error.message),
  );
  assert.throws(
    () =>
      reconstruct({
        ticks: [initialized(-25, 100n), initialized(20, -100n)],
        currentTick: 0,
        activeLiquidity: 100n,
      }),
    /tick spacing/i,
  );
});

test("decodes initialized ticks from negative and positive bitmap words", () => {
  const ticks = decodeInitializedTicksFromBitmap(
    [
      { wordPosition: -1, bitmap: 1n << 255n },
      { wordPosition: 0, bitmap: 1n << 1n },
    ],
    200,
  );
  assert.deepEqual(ticks, [-200, 200]);
});

test("fetches pool state, bitmaps, and initialized ticks from one block snapshot", async () => {
  const requestedBlocks: bigint[] = [];
  const client = {
    getBlockNumber: async () => 123n,
    multicall: async (request: {
      blockNumber: bigint;
      contracts: ReadonlyArray<{ functionName: string; args?: readonly unknown[] }>;
    }) => {
      requestedBlocks.push(request.blockNumber);
      const functionName = request.contracts[0]?.functionName;
      if (functionName === "token0") {
        return [TOKEN_0, TOKEN_1, [1n << 96n, 0, 0, 0, 0, true], 200, 1_000n];
      }
      if (functionName === "tickBitmap") {
        return request.contracts.map(({ args }) => {
          const word = Number(args?.[0]);
          if (word === -1) return 1n << 255n;
          if (word === 0) return 1n << 1n;
          return 0n;
        });
      }
      if (functionName === "ticks") {
        return request.contracts.map(({ args }) => {
          const tick = Number(args?.[0]);
          const net = tick === -200 ? 1_000n : -1_000n;
          return [1_000n, net, 0n, 0n, 0n, 0n, 0n, 0n, 0, true];
        });
      }
      throw new Error(`Unexpected multicall ${functionName}`);
    },
  } as unknown as PublicClient;

  const snapshot = await fetchSlipstreamLiquidityDepth({
    client,
    chainId: 31611,
    poolAddress: POOL,
    poolAbi: [] as Abi,
  });
  assert.equal(snapshot.status, "complete");
  assert.equal(snapshot.blockNumber, 123n);
  assert.deepEqual(
    snapshot.initializedTicks.map(({ tick }) => tick),
    [-200, 200],
  );
  assert.equal(
    snapshot.intervals.find(({ tickLower, tickUpper }) => tickLower === -200 && tickUpper === 200)
      ?.liquidity,
    1_000n,
  );
  assert.ok(requestedBlocks.length >= 3);
  assert.ok(requestedBlocks.every((block) => block === 123n));
});

test("a confirmed liquidity write invalidates the pool-depth refresh boundary", async () => {
  const invalidatedKeys: readonly unknown[][] = [];
  const mutableInvalidatedKeys = invalidatedKeys as unknown[][];
  const txHash = `0x${"ab".repeat(32)}` as const;
  const context = {
    account: TOKEN_0,
    chainId: 999_999,
    contracts: {},
    publicClient: {
      simulateContract: async (request: unknown) => ({ request }),
      waitForTransactionReceipt: async () => ({ status: "success", transactionHash: txHash }),
    },
    writeAsync: async () => txHash,
    queryClient: {
      invalidateQueries: async ({ queryKey }: { queryKey?: readonly unknown[] }) => {
        mutableInvalidatedKeys.push([...(queryKey ?? [])]);
      },
    },
  } as unknown as TxFlowRuntimeContext;
  const abi = [
    {
      type: "function",
      name: "touch",
      stateMutability: "nonpayable",
      inputs: [],
      outputs: [],
    },
  ] as const;
  const step = makeAddressWriteStep({
    key: "liquidity-depth-refresh-test",
    label: "Update liquidity",
    address: POOL,
    abi,
    variables: { functionName: "touch" },
  });
  step.portfolioDomains = ["liquidity"];

  await executePreparedWriteStep(step as unknown as TxPreparedWriteStep, context);

  assert.deepEqual(
    mutableInvalidatedKeys.at(-1),
    slipstreamLiquidityDepthKeys.chain(context.chainId),
  );
});
