import assert from "node:assert/strict";
import test from "node:test";

import {
  EARN_ASSETS,
  earnAssetFromVariant,
  earnStakePath,
  earnVariantFromAsset,
  resolveCreatePositionMode,
  resolveEarnAssetKey,
  selectEarnUserPositions,
} from "./earn-asset";

test("catalog includes avBTCm and avMEZOm earning assets", () => {
  assert.deepEqual(
    EARN_ASSETS.map((asset) => asset.productSymbol),
    ["avBTCm", "avMEZOm"],
  );
});

test("resolves stake routes from BTC and MEZO slugs", () => {
  assert.equal(resolveEarnAssetKey("btc"), "BTC");
  assert.equal(resolveEarnAssetKey("MEZO"), "MEZO");
  assert.equal(resolveEarnAssetKey("unknown"), null);
  assert.equal(earnStakePath("BTC"), "/earn/stake/btc");
  assert.equal(earnStakePath("MEZO"), "/earn/stake/mezo");
  assert.equal(earnStakePath("BTC", "erc20"), "/earn/stake/btc?mode=lock");
  assert.equal(resolveCreatePositionMode("lock"), "erc20");
  assert.equal(resolveCreatePositionMode(undefined), "venft");
});

test("maps variants to assets for route preselection", () => {
  assert.equal(earnVariantFromAsset("BTC"), "veBTC");
  assert.equal(earnVariantFromAsset("MEZO"), "veMEZO");
  assert.equal(earnAssetFromVariant("veBTC"), "BTC");
  assert.equal(earnAssetFromVariant("veMEZO"), "MEZO");
});

test("treats a connected wallet with zero balances as having no positions", () => {
  assert.deepEqual(
    selectEarnUserPositions([
      { userBalanceRaw: 0n, id20BalanceRaw: 0n },
      { userBalanceRaw: 0n, id20BalanceRaw: 0n },
    ]),
    [],
  );
});

test("selects existing liquid and ID20 balances as user positions", () => {
  const products = [
    { id: "empty", userBalanceRaw: 0n, id20BalanceRaw: 0n },
    { id: "tranche", userBalanceRaw: 1n, id20BalanceRaw: 0n },
    { id: "id20", userBalanceRaw: 0n, id20BalanceRaw: 2n },
  ];

  assert.deepEqual(
    selectEarnUserPositions(products).map((product) => product.id),
    ["tranche", "id20"],
  );
});
