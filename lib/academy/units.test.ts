import assert from "node:assert/strict";
import test from "node:test";

import { formatAcademyReferralPoints } from "./units";
import { formatPoints } from "./utils";

test("formats small Academy point values as canonical database decimals", () => {
  const points = formatAcademyReferralPoints(94_058_000_000_000n);

  assert.equal(points, "0.000094058");
  assert.doesNotMatch(points, /[₀₁₂₃₄₅₆₇₈₉]/);
});

test("preserves all 18 supported decimal places", () => {
  assert.equal(formatAcademyReferralPoints(1n), "0.000000000000000001");
  assert.equal(formatAcademyReferralPoints(-1n), "-0.000000000000000001");
});

test("uses compact subscript notation only for display", () => {
  assert.equal(formatPoints(94_058_000_000_000n), "0.0₄94058");
});
