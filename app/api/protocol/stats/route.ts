import { NextResponse } from "next/server";

import { fetchProtocolStatsSnapshot } from "@/lib/protocol-stats/fetch-stats";
import { PROTOCOL_STATS_REVALIDATE_SECONDS } from "@/lib/protocol-stats/config";
import { withNoStoreRouteErrorHandling } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * Homepage protocol summary metrics.
 * Cache aggressively (5–15 min): TVL and holder sets change slowly.
 */
async function getProtocolStats() {
  const snapshot = await fetchProtocolStatsSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": `public, s-maxage=${PROTOCOL_STATS_REVALIDATE_SECONDS}, stale-while-revalidate=${PROTOCOL_STATS_REVALIDATE_SECONDS * 2}, max-age=60`,
    },
  });
}

export const GET = withNoStoreRouteErrorHandling("protocol/stats", getProtocolStats, {
  message: "Unable to load protocol stats.",
  status: 500,
  code: "PROTOCOL_STATS_FAILED",
});
