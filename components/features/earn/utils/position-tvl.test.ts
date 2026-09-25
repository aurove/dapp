import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";

import type { EarnProduct } from "../use-earn-data";
import { estimateEarnProductTvlMusd, wrapperSymbolForVariant } from "./position-tvl";

const AVBTCM = "0xf333171788dE7005695b2E8FB9cAE97Ba9c4dD7a" as Address;

function product(overrides: Partial<EarnProduct> = {}): EarnProduct {
  return {
    id: "btc-1",
    ledgerAddress: "0x1111111111111111111111111111111111111111",
    trancheId: 1n,
    trancheNumber: 1,
    variant: "veBTC",
    name: "avBTCm",
    symbol: "avBTCm",
    veNFT: null,
    decimals: 18,
    totalSupplyRaw: null,
    userBalanceRaw: 10n ** 18n,
    claimableRewardsRaw: 0n,
    userAvailableBalanceRaw: 10n ** 18n,
    rewardAsset: null,
    rewardSymbol: null,
    rewardDecimals: 18,
    rewardReserveRaw: null,
    aprRewardAmountRaw: null,
    aprTotalSupplyAtFundingRaw: null,
    aprFundingBlockNumber: null,
    rewardSinkAddress: null,
    redeemInventory: [],
    id20Address: AVBTCM,
    id20BalanceRaw: 10n ** 18n,
    ...overrides,
  };
}

test("maps earn variants to wrapper symbols", () => {
  assert.equal(wrapperSymbolForVariant("veBTC"), "avBTCm");
  assert.equal(wrapperSymbolForVariant("veMEZO"), "avMEZOm");
});

test("values earn positions with Mezo wrapper prices", () => {
  const value = estimateEarnProductTvlMusd(product(), [
    {
      address: "0xB018BED3b3376cE95ee34db170348FA16d18e29D",
      token0: { address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186", symbol: "MUSD", price: "1" },
      token1: { address: AVBTCM, symbol: "avBTCm", price: "80000" },
    },
  ]);
  assert.equal(value, 160_000);
});
