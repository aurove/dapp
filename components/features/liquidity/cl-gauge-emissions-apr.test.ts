import assert from "node:assert/strict";
import test from "node:test";
import { type Address } from "viem";

import {
  buildMezoTokenPriceMapMusd,
  estimateApiPoolActiveStakedValueMusd,
  estimatePositionLiquidityValueMusd,
  findMezoPoolAprSnapshot,
  normalizeMezoPoolAprSnapshot,
} from "@/lib/liquidity/mezo-pools";

const POOL = "0xB018BED3b3376cE95ee34db170348FA16d18e29D" as Address;

test("normalizes Mezo pool API APR fields", () => {
  const snapshot = normalizeMezoPoolAprSnapshot({
    address: POOL,
    tvl: "19.342678",
    emissionsApr: 99012,
    stats: { apr: 1055 },
    gauge: "0xC5d9ddC440759CCe340c745a6133c7A29E90cF94",
    type: "concentrated",
    stakedLiquidity: "160427981397750881",
    liquidity: "160427981397750881",
  });

  assert.equal(snapshot?.poolAddress, POOL);
  assert.equal(snapshot?.aprPercent, 10.55);
  assert.equal(snapshot?.emissionsAprPercent, 990.12);
  assert.equal(snapshot?.activeStakedValueMusd, 19.342678);
  assert.equal(snapshot?.status, "available");
  assert.equal(snapshot?.unavailableReason, null);
});

test("matches pool snapshots by address case-insensitively", () => {
  const snapshot = findMezoPoolAprSnapshot(
    [
      { address: "0x0000000000000000000000000000000000000001", emissionsApr: 1 },
      { address: POOL.toLowerCase(), emissionsApr: 99012 },
    ],
    POOL,
  );

  assert.equal(snapshot?.poolAddress, POOL);
  assert.equal(snapshot?.emissionsAprPercent, 990.12);
});

test("estimates active staked value as API staked liquidity share of TVL", () => {
  assert.equal(
    estimateApiPoolActiveStakedValueMusd({
      tvlMusd: 10_000,
      stakedLiquidity: 25n,
      liquidity: 100n,
    }),
    2_500,
  );
  assert.equal(
    estimateApiPoolActiveStakedValueMusd({
      tvlMusd: 10_000,
      stakedLiquidity: 150n,
      liquidity: 100n,
    }),
    10_000,
  );
});

test("marks unavailable pools without positive Mezo API emissions APR", () => {
  const snapshot = normalizeMezoPoolAprSnapshot({
    address: POOL,
    tvl: "10",
    emissionsApr: 0,
    stats: { apr: 0 },
  });

  assert.equal(snapshot?.emissionsAprPercent, null);
  assert.equal(snapshot?.status, "unavailable");
  assert.match(snapshot?.unavailableReason ?? "", /not reporting MEZO emissions APR/);
});

test("values positions from Mezo API token prices with TVL-share fallback", () => {
  const token0 = "0x1111111111111111111111111111111111111111" as Address;
  const token1 = "0x2222222222222222222222222222222222222222" as Address;
  const prices = buildMezoTokenPriceMapMusd([
    {
      address: POOL,
      token0: { address: token0, price: "2", decimals: 18 },
      token1: { address: token1, price: "10", decimals: 18 },
      tvl: "1000",
      liquidity: "100",
    },
  ]);

  assert.equal(prices.get(token0.toLowerCase()), 2);
  assert.equal(
    estimatePositionLiquidityValueMusd({
      amount0Raw: 10n ** 18n,
      amount1Raw: 10n ** 18n,
      decimals0: 18,
      decimals1: 18,
      token0,
      token1,
      positionLiquidity: 25n,
      priceByToken: prices,
      poolTvlMusd: 1_000,
      poolLiquidity: 100n,
    }),
    12,
  );
  assert.equal(
    estimatePositionLiquidityValueMusd({
      amount0Raw: null,
      amount1Raw: null,
      decimals0: 18,
      decimals1: 18,
      token0,
      token1,
      positionLiquidity: 25n,
      priceByToken: new Map(),
      poolTvlMusd: 1_000,
      poolLiquidity: 100n,
    }),
    250,
  );
});
