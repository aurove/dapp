import assert from "node:assert/strict";
import test from "node:test";

import { claimAllGaugeLabel, id20RewardsPanelState } from "./rewards-status";

test("maps ID20 gauge panel loading, error, empty, and ready states", () => {
  assert.equal(
    id20RewardsPanelState({ isLoading: true, error: null, positionCount: 0 }),
    "loading",
  );
  assert.equal(
    id20RewardsPanelState({ isLoading: false, error: new Error("rpc"), positionCount: 0 }),
    "error",
  );
  assert.equal(id20RewardsPanelState({ isLoading: false, error: null, positionCount: 0 }), "empty");
  assert.equal(id20RewardsPanelState({ isLoading: false, error: null, positionCount: 2 }), "ready");
});

test("formats the claim-all success message from claimable gauge count", () => {
  assert.equal(claimAllGaugeLabel(1), "Claimed all available ID20 gauge rewards from 1 gauge.");
  assert.equal(claimAllGaugeLabel(2), "Claimed all available ID20 gauge rewards from 2 gauges.");
});
