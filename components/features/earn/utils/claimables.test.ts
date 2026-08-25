import assert from "node:assert/strict";
import test from "node:test";

import type { EarnProduct } from "../use-earn-data";
import { claimablesPanelState, summarizeClaimables } from "./claimables";

function product(overrides: Partial<EarnProduct> = {}): EarnProduct {
  return {
    id: "avBTCm",
    symbol: "avBTCm",
    claimableRewardsRaw: 0n,
    rewardSymbol: "BTC",
    rewardDecimals: 18,
    rewardAsset: "0x1111111111111111111111111111111111111111",
    ...overrides,
  } as EarnProduct;
}

test("empty products produce an empty claimables panel", () => {
  const summaries = summarizeClaimables([]);
  assert.equal(summaries.length, 0);
  assert.equal(claimablesPanelState(summaries), "empty");
});

test("aggregates claimable tranches by reward asset", () => {
  const summaries = summarizeClaimables([
    product({
      id: "a",
      claimableRewardsRaw: 10n,
      rewardAsset: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    product({
      id: "b",
      claimableRewardsRaw: 5n,
      rewardAsset: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    product({
      id: "c",
      claimableRewardsRaw: 7n,
      rewardSymbol: "MEZO",
      rewardAsset: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }),
    product({ id: "d", claimableRewardsRaw: 0n }),
  ]);

  assert.equal(claimablesPanelState(summaries), "claimable");
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.symbol, "BTC");
  assert.equal(summaries[0]?.amountRaw, 15n);
  assert.equal(summaries[0]?.trancheCount, 2);
  assert.equal(summaries[1]?.symbol, "MEZO");
  assert.equal(summaries[1]?.amountRaw, 7n);
});
