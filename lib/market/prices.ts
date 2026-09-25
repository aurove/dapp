import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getContractConfig } from "@/contracts/shared";
import { getKnownMusdConfig } from "@/lib/config/musd";

import { MARKET_TICKER_PAIRS, getMarketChainId } from "./config";
import { fetchMezoSpotPrices } from "./mezo-prices";
import type { MarketPriceQuote, MarketPricesSnapshot } from "./types";

/**
 * Build ticker quotes from Mezo's public API spots.
 * 24h change is not published by Mezo's API, so change24hPct is always null.
 */
export async function fetchMarketPricesSnapshot(): Promise<MarketPricesSnapshot> {
  const chainId = getMarketChainId();
  const earn = getEarnProtocolAddresses(chainId);
  const musd = getKnownMusdConfig(chainId);
  const musdAvBtcmPool = getContractConfig(chainId, "MUSD-avBTCm");

  const spots = await fetchMezoSpotPrices({
    musdAddress: musd?.address ?? null,
    musdAvBtcmPoolAddress: musdAvBtcmPool?.address ?? null,
    avBTCmAddress: earn.auroveId20Address ?? null,
    avMEZOmAddress: earn.mezoAuroveId20Address ?? null,
  }).catch((error) => {
    console.warn(
      "[market/prices] Mezo API unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  });

  const quotes: MarketPriceQuote[] = MARKET_TICKER_PAIRS.map((pair) => {
    let priceMusd: number | null = null;
    if (pair.pricing === "liquid-id20") {
      priceMusd =
        pair.liquidId20 === "avBTCm"
          ? (spots?.avBTCmMusd ?? null)
          : pair.liquidId20 === "avMEZOm"
            ? (spots?.avMEZOmMusd ?? null)
            : null;
    } else if (pair.underlying === "BTC") {
      priceMusd = spots?.btcMusd ?? null;
    } else {
      priceMusd = spots?.mezoMusd ?? null;
    }

    return {
      id: pair.id,
      symbol: pair.symbol,
      quoteSymbol: "mUSD",
      priceMusd,
      change24hPct: null,
      asOf: spots?.asOf ?? null,
      source: priceMusd != null ? "mezo-api" : "unavailable",
    };
  });

  return {
    chainId,
    fetchedAt: Date.now(),
    quotes,
    healthy: quotes.some((quote) => quote.priceMusd != null),
  };
}
