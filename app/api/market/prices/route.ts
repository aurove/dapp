import { NextResponse } from "next/server";

import { fetchMarketPricesSnapshot } from "@/lib/market/prices";
import { withNoStoreRouteErrorHandling } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * Live market prices for the global ticker.
 * Cache: short CDN/browser TTL + SWR so the bar feels live without hammering Hermes.
 */
async function getMarketPrices() {
  const snapshot = await fetchMarketPricesSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": "public, s-maxage=25, stale-while-revalidate=45, max-age=15",
    },
  });
}

export const GET = withNoStoreRouteErrorHandling("market/prices", getMarketPrices, {
  message: "Unable to load market prices.",
  status: 500,
  code: "MARKET_PRICES_FAILED",
});
