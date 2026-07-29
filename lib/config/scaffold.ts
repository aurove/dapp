import { hardhat } from "wagmi/chains";

import { mezoMainnetChain, resolveAppEnvironment } from "@/lib/config/chains";

/**
 * Scaffold-ETH-2 style burner wallet visibility.
 *
 * - localNetworksOnly: only when the active app chain is Hardhat/Anvil (31337) — default
 * - allNetworks: any configured non-mainnet chain (or mainnet if explicitly allowed)
 * - disabled: never show the burner
 */
export type BurnerWalletMode = "localNetworksOnly" | "allNetworks" | "disabled";

const LOCAL_CHAIN_IDS = new Set<number>([hardhat.id, 31337]);

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

/**
 * Resolves burner visibility mode.
 *
 * Preferred: `NEXT_PUBLIC_BURNER_WALLET_MODE=localNetworksOnly|allNetworks|disabled`
 * Legacy SE-2 style boolean: `NEXT_PUBLIC_ONLY_LOCAL_BURNER_WALLET=true|false`
 *   - true  → localNetworksOnly (default)
 *   - false → allNetworks
 */
export function getBurnerWalletMode(): BurnerWalletMode {
  const modeRaw = process.env.NEXT_PUBLIC_BURNER_WALLET_MODE?.trim().toLowerCase();
  if (modeRaw) {
    if (modeRaw === "localnetworksonly" || modeRaw === "local" || modeRaw === "local-only") {
      return "localNetworksOnly";
    }
    if (modeRaw === "allnetworks" || modeRaw === "all") {
      return "allNetworks";
    }
    if (modeRaw === "disabled" || modeRaw === "off" || modeRaw === "false") {
      return "disabled";
    }
  }

  const onlyLocal = parseBooleanEnv(process.env.NEXT_PUBLIC_ONLY_LOCAL_BURNER_WALLET, true);
  return onlyLocal ? "localNetworksOnly" : "allNetworks";
}

export function isLocalBurnerChain(chainId: number): boolean {
  return LOCAL_CHAIN_IDS.has(chainId);
}

/**
 * Whether RainbowKit should list the Burner Wallet for the active chain.
 * Mainnet is blocked unless `NEXT_PUBLIC_BURNER_WALLET_ALLOW_MAINNET=true`.
 */
export function shouldShowBurnerWallet(chainId: number): boolean {
  const mode = getBurnerWalletMode();
  if (mode === "disabled") return false;

  const allowMainnet = parseBooleanEnv(process.env.NEXT_PUBLIC_BURNER_WALLET_ALLOW_MAINNET, false);
  if (chainId === mezoMainnetChain.id && !allowMainnet) {
    return false;
  }

  // Production app env never enables burner unless mode is allNetworks and mainnet allowed
  // (still blocked above). Extra guard: when APP_ENV is mainnet and only-local default.
  const appEnv = resolveAppEnvironment();
  if (appEnv === "mainnet" && mode === "localNetworksOnly") {
    return false;
  }

  if (mode === "allNetworks") return true;
  return isLocalBurnerChain(chainId);
}

/**
 * Optional fixed private key for E2E / local demos.
 * Accepts with or without 0x prefix.
 *
 * Hardhat account #0:
 * 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 * → 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */
export function getDeterministicBurnerPrivateKey(): `0x${string}` | null {
  const raw =
    process.env.NEXT_PUBLIC_BURNER_PRIVATE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_E2E_BURNER_PK?.trim() ||
    process.env.E2E_BURNER_PK?.trim();

  if (!raw) return null;

  const normalized = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (normalized.length !== 66) {
    console.warn(
      "[burner] Ignoring deterministic private key: expected 32-byte hex (66 chars with 0x).",
    );
    return null;
  }

  return normalized;
}

/** Storage key used by burner-connector (`loadBurnerPK`). */
export const BURNER_WALLET_STORAGE_KEY = "burnerWallet.pk";
