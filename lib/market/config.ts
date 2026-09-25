import type { Address } from "viem";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";

import type { MarketPairId } from "./types";

/** Skip Connect BTC/USD aggregator (Chainlink-compatible), Mezo precompile-style address. */
export const DEFAULT_SKIP_BTC_ORACLE_ADDRESS =
  "0x7b7c000000000000000000000000000000000015" as const satisfies Address;

/**
 * Display order for the global ticker.
 * - BTC / MEZO: Mezo API token spots
 * - veBTC / veMEZO: Mezo API liquid wrapper spots (avBTCm / avMEZOm)
 */
export const MARKET_TICKER_PAIRS: readonly {
  id: MarketPairId;
  symbol: string;
  /** Spot source for the quote. */
  pricing: "mezo-underlying" | "liquid-id20";
  /** Underlying / liquid mapping. */
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
    pricing: "mezo-underlying",
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
    pricing: "mezo-underlying",
    underlying: "MEZO",
    liquidId20: null,
  },
] as const;

/** Client refetch cadence: 30–45s window; default 35s. */
export const MARKET_PRICES_REFETCH_MS = 35_000;
export const MARKET_PRICES_STALE_MS = 30_000;
export const MARKET_PRICES_GC_MS = 10 * 60_000;

export function getSkipBtcOracleAddress(): Address {
  const raw = process.env.NEXT_PUBLIC_SKIP_BTC_ORACLE_ADDRESS?.trim();
  return (raw || DEFAULT_SKIP_BTC_ORACLE_ADDRESS) as Address;
}

/** Active product chain for market reads (mainnet in production, testnet otherwise). */
export function getMarketChainId(): number {
  return getActiveChain(resolveAppEnvironment()).id;
}
