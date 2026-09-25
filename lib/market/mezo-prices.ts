import "server-only";

import { getAddress, isAddress, type Address } from "viem";

const DEFAULT_MEZO_API_BASE_URL = "https://api.mezo.org";
const MEZO_ORIGIN = "https://mezo.org";

export type MezoSpotPrices = {
  btcMusd: number | null;
  mezoMusd: number | null;
  musdMusd: number | null;
  avBTCmMusd: number | null;
  avMEZOmMusd: number | null;
  /** MUSD reserve in the MUSD/avBTCm pool (human units), when reported by Mezo. */
  musdAvBtcmReserveMusd: number | null;
  asOf: number;
  source: "mezo-api";
};

type MezoApiToken = {
  address?: unknown;
  symbol?: unknown;
  price?: unknown;
  reserve?: unknown;
  decimals?: unknown;
};

type MezoApiPool = {
  address?: unknown;
  token0?: MezoApiToken;
  token1?: MezoApiToken;
};

function getMezoApiBaseUrl() {
  return (
    process.env.MEZO_POOLS_API_BASE_URL?.trim() ||
    process.env.MEZO_API_BASE_URL?.trim() ||
    DEFAULT_MEZO_API_BASE_URL
  );
}

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return getAddress(value);
}

function parseBigIntString(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function sameAddress(left: unknown, right: Address | null | undefined) {
  if (typeof left !== "string" || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function humanReserve(token: MezoApiToken | undefined): number | null {
  const reserve = parseBigIntString(token?.reserve);
  const decimals = parseNumber(token?.decimals);
  if (reserve == null || decimals == null || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  const amount = Number(reserve) / 10 ** decimals;
  return Number.isFinite(amount) ? amount : null;
}

async function fetchMezoJson<T>(path: string): Promise<T | null> {
  const url = new URL(path, getMezoApiBaseUrl());
  if (path.includes("pools") && !url.searchParams.has("filter")) {
    url.searchParams.set("filter", "none");
  }
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      origin: MEZO_ORIGIN,
      referer: `${MEZO_ORIGIN}/earn/pools`,
    },
    next: { revalidate: 30 },
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function pickTokenPrice(
  tokens: readonly MezoApiToken[],
  symbol: string,
  address?: Address | null,
): number | null {
  for (const token of tokens) {
    const matchesSymbol =
      typeof token.symbol === "string" && token.symbol.toLowerCase() === symbol.toLowerCase();
    const matchesAddress = address ? sameAddress(token.address, address) : false;
    if (!matchesSymbol && !matchesAddress) continue;
    const price = parseNumber(token.price);
    if (price != null && price > 0) return price;
  }
  return null;
}

function collectPoolTokens(pools: readonly MezoApiPool[]): MezoApiToken[] {
  const tokens: MezoApiToken[] = [];
  for (const pool of pools) {
    if (pool.token0) tokens.push(pool.token0);
    if (pool.token1) tokens.push(pool.token1);
  }
  return tokens;
}

function findMusdReserveInAvBtcmPool(
  pools: readonly MezoApiPool[],
  musdAddress: Address | null,
  poolAddress: Address | null,
): number | null {
  for (const pool of pools) {
    if (poolAddress && !sameAddress(pool.address, poolAddress)) continue;
    for (const token of [pool.token0, pool.token1]) {
      const isMusd =
        (typeof token?.symbol === "string" && token.symbol.toUpperCase() === "MUSD") ||
        (musdAddress ? sameAddress(token?.address, musdAddress) : false);
      if (!isMusd) continue;
      const reserve = humanReserve(token);
      if (reserve != null && reserve >= 0) return reserve;
    }
  }
  return null;
}

/**
 * Spot prices from Mezo's public API (`/tokens` + `/pools`).
 * No 24h change is available from these endpoints.
 */
export async function fetchMezoSpotPrices(input?: {
  musdAddress?: Address | null;
  musdAvBtcmPoolAddress?: Address | null;
  avBTCmAddress?: Address | null;
  avMEZOmAddress?: Address | null;
}): Promise<MezoSpotPrices> {
  const [tokensBody, poolsBody] = await Promise.all([
    fetchMezoJson<{ success?: boolean; data?: MezoApiToken[] }>("/tokens"),
    fetchMezoJson<{ success?: boolean; data?: MezoApiPool[] }>("/pools"),
  ]);

  const tokens = [
    ...(tokensBody?.success && Array.isArray(tokensBody.data) ? tokensBody.data : []),
    ...collectPoolTokens(
      poolsBody?.success && Array.isArray(poolsBody.data) ? poolsBody.data : [],
    ),
  ];
  const pools =
    poolsBody?.success && Array.isArray(poolsBody.data) ? poolsBody.data : ([] as MezoApiPool[]);

  return {
    btcMusd: pickTokenPrice(tokens, "BTC"),
    mezoMusd: pickTokenPrice(tokens, "MEZO"),
    musdMusd: pickTokenPrice(tokens, "MUSD", input?.musdAddress ?? null),
    avBTCmMusd: pickTokenPrice(tokens, "avBTCm", input?.avBTCmAddress ?? null),
    avMEZOmMusd: pickTokenPrice(tokens, "avMEZOm", input?.avMEZOmAddress ?? null),
    musdAvBtcmReserveMusd: findMusdReserveInAvBtcmPool(
      pools,
      input?.musdAddress ?? null,
      input?.musdAvBtcmPoolAddress ?? null,
    ),
    asOf: Math.floor(Date.now() / 1000),
    source: "mezo-api",
  };
}

export function estimateRawAmountValueMusd(
  amountRaw: bigint,
  decimals: number,
  priceMusd: number | null,
): number | null {
  if (amountRaw < 0n || decimals < 0 || priceMusd == null || !(priceMusd > 0)) return null;
  const amount = Number(amountRaw) / 10 ** decimals;
  if (!Number.isFinite(amount)) return null;
  const value = amount * priceMusd;
  return Number.isFinite(value) ? value : null;
}
