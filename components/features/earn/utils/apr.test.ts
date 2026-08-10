import assert from "node:assert/strict";
import test from "node:test";

import type { EarnProduct } from "../use-earn-data";
import { estimateTrancheApr, summarizeAnnualisedApr } from "./apr";

function product(overrides: Partial<EarnProduct> = {}): EarnProduct {
  return {
    symbol: "avMEZOm",
    rewardDecimals: 18,
    decimals: 18,
    aprRewardAmountRaw: 3_914_094_215_817_150_671_268n,
    aprTotalSupplyAtFundingRaw: 165_319_468_442_356_089_595_430n,
    ...overrides,
  } as EarnProduct;
}

test("annualises the latest weekly funding rate without compounding", () => {
  const estimate = estimateTrancheApr(product());

  assert.ok(estimate);
  assert.ok(Math.abs(estimate.annualisedAprPercent - 123.45312833509404) < 1e-10);
});

test("does not estimate APR without a positive reward and funding-time supply", () => {
  assert.equal(estimateTrancheApr(product({ aprRewardAmountRaw: 0n })), null);
  assert.equal(estimateTrancheApr(product({ aprTotalSupplyAtFundingRaw: 0n })), null);
});

test("labels the summary as latest weekly funding annualised", () => {
  const estimate = estimateTrancheApr(product());
  assert.ok(estimate);

  const summary = summarizeAnnualisedApr([estimate]);
  assert.match(summary.detail, /^Latest weekly funding, annualised: avMEZOm /);
});
