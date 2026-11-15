import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trimHorizonNttAmount } from "@/lib/bridge/ntt-transfer";

describe("trimHorizonNttAmount", () => {
  it("floors 18-decimal amounts to 8-decimal wire precision", () => {
    const dusty = 9999984662119369187n;
    assert.equal(trimHorizonNttAmount(dusty, 18), 9999984660000000000n);
  });

  it("leaves amounts already aligned unchanged", () => {
    assert.equal(trimHorizonNttAmount(5_000_000_000_000_000_000n, 18), 5_000_000_000_000_000_000n);
  });

  it("returns zero for dust-only amounts", () => {
    assert.equal(trimHorizonNttAmount(2119369187n, 18), 0n);
  });

  it("is a no-op when token decimals are already <= 8", () => {
    assert.equal(trimHorizonNttAmount(12345678n, 8), 12345678n);
  });
});
