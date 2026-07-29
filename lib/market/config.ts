import type { Address, Hex } from "viem";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";

import type { MarketPairId, PythFeedId } from "./types";

/** Mezo Pyth contract (same on testnet + mainnet). */
export const DEFAULT_PYTH_ORACLE_ADDRESS =
  "0x2880aB155794e7179c9eE2e38200202908C17B43" as const satisfies Address;

/** Skip Connect BTC/USD aggregator (Chainlink-compatible), Mezo precompile-style address. */
export const DEFAULT_SKIP_BTC_ORACLE_ADDRESS =
  "0x7b7c000000000000000000000000000000000015" as const satisfies Address;

/** Pyth Hermes public REST base. Override with NEXT_PUBLIC_PYTH_HERMES_URL. */
export const DEFAULT_PYTH_HERMES_URL = "https://hermes.pyth.network";

/**
 * Official Mezo-supported Pyth feed IDs.
 * @see https://mezo.org/docs/developers/architecture/oracles/read-oracle/
 */
export const PYTH_FEED_IDS: Record<PythFeedId, Hex> = {
  BTC_USD: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  MEZO_USD: "0x80beaaedbdd228e77c5d62dfcd74b0305674b7e27a5cc6a46e71bd3a696826df",
  MUSD_USD: "0x0617a9b725011a126a2b9fd53563f4236501f32cf76d877644b943394606c6de",
};

/**
 * Display order for the global ticker.
 * - BTC / MEZO: Pyth USD feeds (normalized to mUSD)
 * - veBTC / veMEZO: liquid wrappers avBTCm / avMEZOm via Aurove CL pool spots
 */
export const MARKET_TICKER_PAIRS: readonly {
  id: MarketPairId;
  symbol: string;
  /** Spot source for the quote. */
  pricing: "pyth-underlying" | "liquid-id20";
  /** Pyth / liquid mapping. */
  underlying: "BTC" | "MEZO";
  liquidId20: "avBTCm" | "avMEZOm" | null;
}[] = [
  {
    id: "veBTC",
    symbol: "veBTC",
    pricing: "liquid-id20",
    underlying: "BTC",
    liquidId20: "avBTCm",
  },
  {
    id: "BTC",
    symbol: "BTC",
    pricing: "pyth-underlying",
    underlying: "BTC",
    liquidId20: null,
  },
  {
    id: "veMEZO",
    symbol: "veMEZO",
    pricing: "liquid-id20",
    underlying: "MEZO",
    liquidId20: "avMEZOm",
  },
  {
    id: "MEZO",
    symbol: "MEZO",
    pricing: "pyth-underlying",
    underlying: "MEZO",
    liquidId20: null,
  },
] as const;

/** Client refetch cadence: 30–45s window; default 35s. */
export const MARKET_PRICES_REFETCH_MS = 35_000;
export const MARKET_PRICES_STALE_MS = 30_000;
export const MARKET_PRICES_GC_MS = 10 * 60_000;

export function getPythHermesUrl(): string {
  return process.env.NEXT_PUBLIC_PYTH_HERMES_URL?.trim() || DEFAULT_PYTH_HERMES_URL;
}

export function getPythOracleAddress(): Address {
  const raw = process.env.NEXT_PUBLIC_PYTH_ORACLE_ADDRESS?.trim();
  return (raw || DEFAULT_PYTH_ORACLE_ADDRESS) as Address;
}

export function getSkipBtcOracleAddress(): Address {
  const raw = process.env.NEXT_PUBLIC_SKIP_BTC_ORACLE_ADDRESS?.trim();
  return (raw || DEFAULT_SKIP_BTC_ORACLE_ADDRESS) as Address;
}

/** Chain used for market endpoints — follows NEXT_PUBLIC_APP_ENV. */
export function getMarketChainId(): number {
  return getActiveChain(resolveAppEnvironment()).id;
}
