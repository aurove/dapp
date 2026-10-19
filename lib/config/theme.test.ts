import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppTheme, themeColorFor } from "./theme";

test("resolveAppTheme maps mainnet to dark and other envs to light", () => {
  assert.equal(resolveAppTheme("mainnet"), "dark");
  assert.equal(resolveAppTheme("testnet"), "light");
  assert.equal(resolveAppTheme("local"), "light");
});

test("themeColorFor returns chrome colors per theme", () => {
  assert.equal(themeColorFor("dark"), "#0a0f15");
  assert.equal(themeColorFor("light"), "#f4efe6");
});
