import {
  BURNER_WALLET_STORAGE_KEY,
  getDeterministicBurnerPrivateKey,
} from "@/lib/config/scaffold";

/**
 * If a deterministic private key is configured (local/E2E only), seed
 * burner-connector's localStorage key before RainbowKit/wagmi connect.
 *
 * burner-connector reads `burnerWallet.pk` via `loadBurnerPK()`.
 */
export function ensureDeterministicBurnerPrivateKey(): void {
  if (typeof window === "undefined") return;

  const pk = getDeterministicBurnerPrivateKey();
  if (!pk) return;

  try {
    window.localStorage.setItem(BURNER_WALLET_STORAGE_KEY, pk);
  } catch {
    // Private mode / blocked storage — connector will fall back to random key.
  }
}
