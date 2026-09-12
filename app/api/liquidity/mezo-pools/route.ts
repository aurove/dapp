import { NextResponse } from "next/server";
import { formatUnits, parseAbi, type Address } from "viem";

import { getKnownMezoTokenConfig } from "@/components/shared/known-mezo-tokens";
import { getEarnProtocolAddresses } from "@/contracts/earn";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { resolveGaugeIncentiveTarget } from "@/lib/config/supported-liquidity-pools";
import { fetchLiquidId20MusdPrices } from "@/lib/market/liquid-prices";
import { withNoStoreRouteErrorHandling } from "@/lib/server/http";
import { getServerPublicClient } from "@/lib/web3/server-chain-time";
import type { MezoApiPool, MezoApiPoolToken } from "@/lib/liquidity/mezo-pools";

export const runtime = "nodejs";

const DEFAULT_MEZO_POOLS_API_BASE_URL = "https://api.mezo.org";
const MEZO_ORIGIN = "https://mezo.org";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const API_APR_BASIS = 100;
const CL_GAUGE_REWARDS_ABI = parseAbi([
  "function rewardRate() view returns (uint256)",
  "function periodFinish() view returns (uint256)",
]);

function getMezoPoolsApiBaseUrl() {
  return process.env.MEZO_POOLS_API_BASE_URL?.trim() || DEFAULT_MEZO_POOLS_API_BASE_URL;
}

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBigIntString(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function sameAddress(left: unknown, right: Address | null | undefined) {
  if (typeof left !== "string" || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function tokenReserveValueMusd(token: MezoApiPoolToken | undefined, fallbackPrice: number | null) {
  const reserve = parseBigIntString(token?.reserve);
  const decimals = parseNumber(token?.decimals);
  if (reserve == null || decimals == null || !Number.isInteger(decimals)) return null;

  const apiPrice = parseNumber(token?.price);
  const price = fallbackPrice ?? apiPrice;
  if (price == null || price <= 0) return null;

  const amount = Number(formatUnits(reserve, decimals));
  return Number.isFinite(amount) ? amount * price : null;
}

function estimateStakedValueMusd(poolTvlMusd: number, pool: MezoApiPool) {
  const stakedLiquidity = parseBigIntString(pool.stakedLiquidity);
  const liquidity = parseBigIntString(pool.liquidity);
  if (stakedLiquidity == null || stakedLiquidity <= 0n) return null;
  if (liquidity == null || liquidity <= 0n) return poolTvlMusd;

  const cappedStake = stakedLiquidity > liquidity ? liquidity : stakedLiquidity;
  const numerator = Number(cappedStake);
  const denominator = Number(liquidity);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return poolTvlMusd * (numerator / denominator);
}

function findTokenPriceInPools(pools: readonly MezoApiPool[], tokenAddress: Address) {
  for (const pool of pools) {
    for (const token of [pool.token0, pool.token1]) {
      if (sameAddress(token?.address, tokenAddress)) {
        const price = parseNumber(token?.price);
        if (price != null && price > 0) return price;
      }
    }
  }
  return null;
}

function getAuroveWrapperFallbackPrice(params: {
  token: MezoApiPoolToken | undefined;
  avBTCm: Address | null | undefined;
  avMEZOm: Address | null | undefined;
  avBTCmMusd: number | null;
  avMEZOmMusd: number | null;
}) {
  if (sameAddress(params.token?.address, params.avBTCm)) return params.avBTCmMusd;
  if (sameAddress(params.token?.address, params.avMEZOm)) return params.avMEZOmMusd;
  return null;
}

async function applyAuroveWrapperPairFallback(pools: MezoApiPool[]) {
  const chain = getActiveChain(resolveAppEnvironment());
  const earn = getEarnProtocolAddresses(chain.id);
  const targetResolution = resolveGaugeIncentiveTarget(chain.id, "MEZO");
  const poolAddress = targetResolution.target?.poolAddress;
  const gaugeAddress = targetResolution.target?.gaugeAddress;
  const target = poolAddress
    ? pools.find((pool) => sameAddress(pool.address, poolAddress))
    : undefined;

  if (!target || !poolAddress || !gaugeAddress) return pools;
  if ((parseNumber(target.emissionsApr) ?? 0) > 0) return pools;

  const client = getServerPublicClient(chain.id);
  const liquidPrices = await fetchLiquidId20MusdPrices(chain.id);
  const mezo = getKnownMezoTokenConfig(chain.id, "MEZO");
  const mezoPrice = mezo ? findTokenPriceInPools(pools, mezo.address) : null;
  if (!client || !liquidPrices || mezoPrice == null) return pools;

  const token0Value = tokenReserveValueMusd(
    target.token0,
    getAuroveWrapperFallbackPrice({
      token: target.token0,
      avBTCm: earn.auroveId20Address,
      avMEZOm: earn.mezoAuroveId20Address,
      avBTCmMusd: liquidPrices.avBTCmMusd,
      avMEZOmMusd: liquidPrices.avMEZOmMusd,
    }),
  );
  const token1Value = tokenReserveValueMusd(
    target.token1,
    getAuroveWrapperFallbackPrice({
      token: target.token1,
      avBTCm: earn.auroveId20Address,
      avMEZOm: earn.mezoAuroveId20Address,
      avBTCmMusd: liquidPrices.avBTCmMusd,
      avMEZOmMusd: liquidPrices.avMEZOmMusd,
    }),
  );
  if (token0Value == null || token1Value == null) return pools;

  const poolTvlMusd = token0Value + token1Value;
  const activeStakedValueMusd = estimateStakedValueMusd(poolTvlMusd, target);
  if (poolTvlMusd <= 0 || activeStakedValueMusd == null || activeStakedValueMusd <= 0) {
    return pools;
  }

  const [rewardRateResult, periodFinishResult, block] = await Promise.all([
    client.readContract({
      address: gaugeAddress,
      abi: CL_GAUGE_REWARDS_ABI,
      functionName: "rewardRate",
    }),
    client.readContract({
      address: gaugeAddress,
      abi: CL_GAUGE_REWARDS_ABI,
      functionName: "periodFinish",
    }),
    client.getBlock({ blockTag: "latest" }),
  ]);

  const rewardRate = typeof rewardRateResult === "bigint" ? rewardRateResult : 0n;
  const periodFinish = typeof periodFinishResult === "bigint" ? periodFinishResult : 0n;
  if (rewardRate <= 0n || periodFinish <= block.timestamp) return pools;

  const rewardPerSecond = Number(formatUnits(rewardRate, mezo?.decimals ?? 18));
  const annualEmissionsValueMusd = rewardPerSecond * SECONDS_PER_YEAR * mezoPrice;
  const emissionsAprPercent = (annualEmissionsValueMusd / activeStakedValueMusd) * 100;
  if (!Number.isFinite(emissionsAprPercent) || emissionsAprPercent <= 0) return pools;

  // Narrow Aurove-only fallback:
  // Mezo's API currently returns the avBTCm/avMEZOm pool, but leaves both wrapper
  // prices null. That collapses its API TVL and emissions APR to zero even while
  // the gauge is streaming MEZO. We patch only this configured pool, only when the
  // API has no positive emissions APR, and we preserve Mezo's raw APR unit
  // convention (basis points) so the client normalizer can treat API and fallback
  // rows identically. Remove this once Mezo's API prices avBTCm and avMEZOm.
  return pools.map((pool) =>
    sameAddress(pool.address, poolAddress)
      ? {
          ...pool,
          tvl: poolTvlMusd.toFixed(6),
          emissionsApr: Math.round(emissionsAprPercent * API_APR_BASIS),
        }
      : pool,
  );
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

  const json = (await response.json()) as { success?: boolean; data?: MezoApiPool[] };
  const body =
    json.success && Array.isArray(json.data)
      ? { ...json, data: await applyAuroveWrapperPairFallback(json.data) }
      : json;

  return NextResponse.json(body, {
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
