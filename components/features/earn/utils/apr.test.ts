import assert from "node:assert/strict";
import test from "node:test";

import type { EarnProduct } from "../use-earn-data";
import {
  earnAprProductKey,
  estimateTrancheApr,
  summarizeAnnualisedApr,
  summarizeAssetApr,
} from "./apr";

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

test("summarizes annualised APR per earning asset", () => {
  const mezo = product({
    variant: "veMEZO",
    rewardSinkAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
  });
  const basis = {
    rewardAmountRaw: mezo.aprRewardAmountRaw!,
    totalSupplyAtFundingRaw: mezo.aprTotalSupplyAtFundingRaw!,
    fundingBlockNumber: 1n,
  };

  const loading = summarizeAssetApr({
    products: [mezo],
    variant: "veMEZO",
    aprBasisMap: {},
    isLoading: true,
  });
  assert.equal(loading.value, "Loading…");
  assert.equal(loading.available, false);

  const unavailable = summarizeAssetApr({
    products: [mezo],
    variant: "veMEZO",
    aprBasisMap: {},
    isLoading: false,
  });
  assert.equal(unavailable.value, "Not available yet");
  assert.equal(unavailable.available, false);

  const otherAsset = summarizeAssetApr({
    products: [mezo],
    variant: "veBTC",
    aprBasisMap: { [earnAprProductKey(mezo)]: basis },
    isLoading: false,
  });
  assert.equal(otherAsset.available, false);

  const ready = summarizeAssetApr({
    products: [mezo],
    variant: "veMEZO",
    aprBasisMap: { [earnAprProductKey(mezo)]: basis },
    isLoading: false,
  });
  assert.equal(ready.available, true);
  assert.match(ready.value, /%/);
});
