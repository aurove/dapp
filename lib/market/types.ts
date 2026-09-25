/** Shared market price types used by the ticker and any future consumers. */

export type MarketPairId = "veBTC" | "BTC" | "veMEZO" | "MEZO";

export type MarketPriceQuote = {
  /** Pair displayed in the ticker (e.g. veBTC, BTC). */
  id: MarketPairId;
  /** Human label without the quote asset, e.g. "BTC". */
  symbol: string;
  /** Quote asset label, always mUSD for this product surface. */
  quoteSymbol: "mUSD";
  /** Price of 1 unit in mUSD. */
  priceMusd: number | null;
  /**
   * 24h relative change in percent. Always null while sourcing from Mezo's API
   * (those endpoints do not publish 24h change).
   */
  change24hPct: number | null;
  /** Unix seconds of the latest sample. */
  asOf: number | null;
  /** Data source label for debugging / UI hints. */
  source: "mezo-api" | "pool-spot" | "derived" | "unavailable";
};

export type MarketPricesSnapshot = {
  chainId: number;
  /** Server generation time (ms). */
  fetchedAt: number;
  quotes: MarketPriceQuote[];
  /** True when at least one quote has a usable price. */
  healthy: boolean;
};
