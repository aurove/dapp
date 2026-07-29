import { MARKET_TICKER_PAIRS, getMarketChainId } from "./config";
import { fetchLiquidId20MusdPrices } from "./liquid-prices";
import { changePct, fetchHermesLatestPrices, fetchHermesPricesAt } from "./pyth";
import type { MarketPriceQuote, MarketPricesSnapshot, PythFeedId, PythPricePoint } from "./types";

function indexPoints(points: PythPricePoint[]): Map<PythFeedId, PythPricePoint> {
  return new Map(points.map((point) => [point.feed, point]));
}

function toMusd(priceUsd: number, musdUsd: number | null): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  // MUSD ≈ $1; when the feed is available, normalize into mUSD terms.
  const divisor = musdUsd != null && musdUsd > 0 ? musdUsd : 1;
  const musd = priceUsd / divisor;
  return Number.isFinite(musd) ? musd : null;
}

/**
 * Build the four ticker quotes.
 *
 * Sources:
 * - BTC/mUSD & MEZO/mUSD from Pyth Hermes (BTC/USD, MEZO/USD, MUSD/USD).
 * - veBTC / veMEZO from liquid id20 pool spots: avBTCm and avMEZOm → mUSD.
 * - 24h % for Pyth pairs from Hermes historical; for liquid pairs, use the
 *   underlying’s 24h move as a market-direction proxy when pool history is unavailable.
 */
export async function fetchMarketPricesSnapshot(): Promise<MarketPricesSnapshot> {
  const chainId = getMarketChainId();
  const nowSec = Math.floor(Date.now() / 1000);

  const [latest, previous, liquid] = await Promise.all([
    fetchHermesLatestPrices(),
    fetchHermesPricesAt(nowSec - 86_400).catch(() => [] as PythPricePoint[]),
    fetchLiquidId20MusdPrices(chainId).catch(() => null),
  ]);

  const latestMap = indexPoints(latest);
  const prevMap = indexPoints(previous);

  const musdNow = latestMap.get("MUSD_USD")?.priceUsd ?? null;
  const musdPrev = prevMap.get("MUSD_USD")?.priceUsd ?? null;

  const quotes: MarketPriceQuote[] = MARKET_TICKER_PAIRS.map((pair) => {
    const feed: PythFeedId = pair.underlying === "BTC" ? "BTC_USD" : "MEZO_USD";
    const current = latestMap.get(feed);
    const prior = prevMap.get(feed);
    const underlyingMusd = current ? toMusd(current.priceUsd, musdNow) : null;
    const priorUnderlyingMusd = prior ? toMusd(prior.priceUsd, musdPrev ?? musdNow) : null;
    const underlyingChange = changePct(underlyingMusd ?? 0, priorUnderlyingMusd);

    if (pair.pricing === "liquid-id20") {
      const liquidPrice =
        pair.liquidId20 === "avBTCm"
          ? (liquid?.avBTCmMusd ?? null)
          : pair.liquidId20 === "avMEZOm"
            ? (liquid?.avMEZOmMusd ?? null)
            : null;

      // Prefer pool spot for the liquid representation; fall back to underlying Pyth
      // only when pools are empty/untrusted so the ticker never shows a blank row.
      const priceMusd = liquidPrice ?? underlyingMusd;
      const usedPool = liquidPrice != null;

      return {
        id: pair.id,
        symbol: pair.symbol,
        quoteSymbol: "mUSD",
        priceMusd,
        // Pool spots lack a cheap 24h history; use underlying direction as proxy.
        change24hPct: underlyingChange,
        asOf: usedPool ? (liquid?.asOf ?? null) : (current?.publishTime ?? null),
        source: usedPool ? "pool-spot" : underlyingMusd != null ? "pyth-hermes" : "unavailable",
      };
    }

    return {
      id: pair.id,
      symbol: pair.symbol,
      quoteSymbol: "mUSD",
      priceMusd: underlyingMusd,
      change24hPct: underlyingChange,
      asOf: current?.publishTime ?? null,
      source: current ? "pyth-hermes" : "unavailable",
    };
  });

  return {
    chainId,
    fetchedAt: Date.now(),
    quotes,
    healthy: quotes.some((quote) => quote.priceMusd != null),
  };
}
