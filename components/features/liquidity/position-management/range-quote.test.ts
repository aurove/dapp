import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";

import {
  getAmountsForLiquidity,
  getLiquidityForAmounts,
  tickToSqrtPriceX96BigInt,
  type SlipstreamPoolState,
} from "../slipstream-adapter";
import {
  buildRangeMigrationQuote,
  collectablePositionAmounts,
  haircutAmount,
  sameTickRange,
} from "./range-quote";

const TOKEN0 = "0x0000000000000000000000000000000000000001" as Address;
const TOKEN1 = "0x0000000000000000000000000000000000000002" as Address;

function poolAtTick(tick: number): SlipstreamPoolState {
  return {
    chainId: 31611,
    address: "0x00000000000000000000000000000000000000aa" as Address,
    token0: { address: TOKEN0, decimals: 18, symbol: "avBTCm", name: "avBTCm" },
    token1: { address: TOKEN1, decimals: 18, symbol: "MUSD", name: "MUSD" },
    currentTick: tick,
    sqrtPriceX96: tickToSqrtPriceX96BigInt(tick),
    tickSpacing: 200,
  };
}

test("haircutAmount always leaves at least 1 wei on amounts above 1", () => {
  assert.equal(haircutAmount(1n), 1n);
  assert.equal(haircutAmount(0n), 0n);
  assert.equal(haircutAmount(10_000n), 9_999n);
  assert.ok(haircutAmount(1_000_000n) < 1_000_000n);
});

test("collectablePositionAmounts includes principal and owed fees", () => {
  assert.deepEqual(
    collectablePositionAmounts({
      rawAmount0: 10n,
      rawAmount1: 20n,
      tokensOwed0: 3n,
      tokensOwed1: 4n,
    }),
    { amount0: 13n, amount1: 24n },
  );
});

test("sameTickRange compares both bounds", () => {
  assert.equal(
    sameTickRange({ tickLower: -200, tickUpper: 200 }, { tickLower: -200, tickUpper: 200 }),
    true,
  );
  assert.equal(
    sameTickRange({ tickLower: -200, tickUpper: 200 }, { tickLower: -400, tickUpper: 200 }),
    false,
  );
});

test("getLiquidityForAmounts matches the tighter of the two in-range sides", () => {
  const sqrtCurrentX96 = tickToSqrtPriceX96BigInt(0);
  const sqrtLowerX96 = tickToSqrtPriceX96BigInt(-2_000);
  const sqrtUpperX96 = tickToSqrtPriceX96BigInt(2_000);
  const liquidity = getLiquidityForAmounts({
    amount0: 10n ** 18n,
    amount1: 10n ** 18n,
    sqrtCurrentX96,
    sqrtLowerX96,
    sqrtUpperX96,
  });
  const used = getAmountsForLiquidity({
    liquidity,
    sqrtCurrentX96,
    sqrtLowerX96,
    sqrtUpperX96,
  });
  assert.ok(liquidity > 0n);
  assert.ok(used.amount0 > 0n && used.amount0 <= 10n ** 18n);
  assert.ok(used.amount1 > 0n && used.amount1 <= 10n ** 18n);
});

test("range migration quote rejects an unchanged range", () => {
  const quote = buildRangeMigrationQuote({
    pool: poolAtTick(0),
    currentRange: { tickLower: -2_000, tickUpper: 2_000 },
    nextRange: { tickLower: -2_000, tickUpper: 2_000 },
    amount0: 10n ** 18n,
    amount1: 10n ** 18n,
    slippageBps: 50n,
  });
  assert.equal(quote.status, "unchanged-range");
});

test("range migration quote reports leftovers when the new range is one-sided", () => {
  const quote = buildRangeMigrationQuote({
    pool: poolAtTick(0),
    currentRange: { tickLower: -2_000, tickUpper: 2_000 },
    nextRange: { tickLower: 200, tickUpper: 4_000 },
    amount0: 10n ** 18n,
    amount1: 10n ** 18n,
    slippageBps: 50n,
  });
  assert.equal(quote.status, "ok");
  assert.equal(quote.beginsInRange, false);
  assert.equal(quote.amount1Used, 0n);
  assert.ok(quote.amount0Used > 0n);
  assert.ok(quote.amount1Leftover > 0n);
});

test("range migration quote fails when the held token cannot seed the new range", () => {
  const quote = buildRangeMigrationQuote({
    pool: poolAtTick(0),
    currentRange: { tickLower: -4_000, tickUpper: -200 },
    nextRange: { tickLower: 200, tickUpper: 4_000 },
    amount0: 0n,
    amount1: 10n ** 18n,
    slippageBps: 50n,
  });
  assert.equal(quote.status, "zero-liquidity");
});
