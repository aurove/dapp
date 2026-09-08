import type { Hex } from "viem";

import { getPythHermesUrl, PYTH_FEED_IDS } from "./config";
import type { PythFeedId, PythPricePoint } from "./types";

type HermesPrice = {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
};

type HermesParsed = {
  id: string;
  price: HermesPrice;
};

type HermesResponse = {
  parsed?: HermesParsed[];
};

function normalizeFeedId(id: string): string {
  return id.replace(/^0x/i, "").toLowerCase();
}

function parseHermesPrice(entry: HermesParsed): number | null {
  const raw = Number(entry.price.price);
  const expo = Number(entry.price.expo);
  if (!Number.isFinite(raw) || !Number.isFinite(expo)) return null;
  const value = raw * 10 ** expo;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function feedIdToKey(hexId: Hex): PythFeedId | null {
  const normalized = normalizeFeedId(hexId);
  for (const [key, value] of Object.entries(PYTH_FEED_IDS) as [PythFeedId, Hex][]) {
    if (normalizeFeedId(value) === normalized) return key;
  }
  return null;
}

function getPythHermesApiKey(): string | null {
  return process.env.PYTH_HERMES_API_KEY?.trim() || process.env.PYTH_API_KEY?.trim() || null;
}

function getHermesHeaders(): HeadersInit {
  const apiKey = getPythHermesApiKey();
  return {
    accept: "application/json",
    "user-agent": "aurove-dapp/market",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

function createHermesError(kind: "latest" | "historical", status: number): Error {
  const apiKey = getPythHermesApiKey();
  const authHint =
    status === 401
      ? apiKey
        ? ": check PYTH_HERMES_API_KEY"
        : ": set PYTH_HERMES_API_KEY"
      : "";
  return new Error(`Pyth Hermes ${kind} failed (${status})${authHint}`);
}

/**
 * Fetch latest Pyth prices from Hermes (off-chain). Preferred path for the ticker:
 * no gas, multi-feed in one request, works even when on-chain feeds are stale.
 *
 * Refresh strategy: API route caches ~20–30s; client refetches every ~35s.
 */
export async function fetchHermesLatestPrices(
  feeds: readonly PythFeedId[] = ["BTC_USD", "MEZO_USD", "MUSD_USD"],
): Promise<PythPricePoint[]> {
  const base = getPythHermesUrl().replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const feed of feeds) {
    params.append("ids[]", PYTH_FEED_IDS[feed]);
  }

  const response = await fetch(`${base}/v2/updates/price/latest?${params.toString()}`, {
    headers: getHermesHeaders(),
    // Server-side revalidation; browser callers hit our API route instead.
    next: { revalidate: 20 },
  });

  if (!response.ok) {
    throw createHermesError("latest", response.status);
  }

  const payload = (await response.json()) as HermesResponse;
  const points: PythPricePoint[] = [];
  for (const entry of payload.parsed ?? []) {
    const feed = feedIdToKey(`0x${normalizeFeedId(entry.id)}` as Hex);
    const priceUsd = parseHermesPrice(entry);
    if (!feed || priceUsd == null) continue;
    points.push({
      feed,
      priceUsd,
      publishTime: Number(entry.price.publish_time) || 0,
    });
  }
  return points;
}

/**
 * Historical sample for 24h change. Hermes returns the closest update at/after `timestamp`.
 */
export async function fetchHermesPricesAt(
  timestampSec: number,
  feeds: readonly PythFeedId[] = ["BTC_USD", "MEZO_USD", "MUSD_USD"],
): Promise<PythPricePoint[]> {
  const base = getPythHermesUrl().replace(/\/$/, "");
  const safeTs = Math.max(0, Math.floor(timestampSec));
  const params = new URLSearchParams();
  for (const feed of feeds) {
    params.append("ids[]", PYTH_FEED_IDS[feed]);
  }

  const response = await fetch(`${base}/v2/updates/price/${safeTs}?${params.toString()}`, {
    headers: getHermesHeaders(),
    next: { revalidate: 120 },
  });

  if (!response.ok) {
    throw createHermesError("historical", response.status);
  }

  const payload = (await response.json()) as HermesResponse;
  const points: PythPricePoint[] = [];
  for (const entry of payload.parsed ?? []) {
    const feed = feedIdToKey(`0x${normalizeFeedId(entry.id)}` as Hex);
    const priceUsd = parseHermesPrice(entry);
    if (!feed || priceUsd == null) continue;
    points.push({
      feed,
      priceUsd,
      publishTime: Number(entry.price.publish_time) || 0,
    });
  }
  return points;
}

export function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  if (!Number.isFinite(current) || current <= 0) return null;
  return ((current - previous) / previous) * 100;
}
