import { NextResponse } from "next/server";

import { withNoStoreRouteErrorHandling } from "@/lib/server/http";

export const runtime = "nodejs";

const DEFAULT_MEZO_POOLS_API_BASE_URL = "https://api.mezo.org";
const MEZO_ORIGIN = "https://mezo.org";

function getMezoPoolsApiBaseUrl() {
  return process.env.MEZO_POOLS_API_BASE_URL?.trim() || DEFAULT_MEZO_POOLS_API_BASE_URL;
}

async function getMezoPools() {
  const url = new URL("pools", getMezoPoolsApiBaseUrl());
  url.searchParams.set("filter", "none");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      origin: MEZO_ORIGIN,
      referer: `${MEZO_ORIGIN}/earn/pools`,
    },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`Mezo pools request failed (${response.status})`);
  }

  return NextResponse.json(await response.json(), {
    headers: {
      "cache-control": "public, s-maxage=30, stale-while-revalidate=60, max-age=15",
    },
  });
}

export const GET = withNoStoreRouteErrorHandling("liquidity/mezo-pools", getMezoPools, {
  message: "Unable to load Mezo pool APR data.",
  status: 502,
  code: "MEZO_POOLS_FAILED",
});
