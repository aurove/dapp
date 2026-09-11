import { getAddress, isAddress, type Address } from "viem";

export type MezoApiPool = {
  address?: unknown;
  tvl?: unknown;
  emissionsApr?: unknown;
  stats?: {
    apr?: unknown;
  };
  gauge?: unknown;
  type?: unknown;
  stakedLiquidity?: unknown;
  liquidity?: unknown;
};

export type MezoPoolAprSnapshot = {
  poolAddress: Address;
  gaugeAddress: Address | null;
  aprPercent: number | null;
  emissionsAprPercent: number | null;
  tvlMusd: number | null;
  activeStakedValueMusd: number | null;
  stakedLiquidity: bigint | null;
  liquidity: bigint | null;
  status: "available" | "unavailable";
  unavailableReason: string | null;
};

function normalizeOptionalAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return getAddress(value);
}

function normalizeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeApr(value: unknown): number | null {
  const parsed = normalizeNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function normalizeBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function estimateApiPoolActiveStakedValueMusd(params: {
  tvlMusd: number | null;
  stakedLiquidity: bigint | null;
  liquidity: bigint | null;
}): number | null {
  const { tvlMusd, stakedLiquidity, liquidity } = params;
  if (tvlMusd == null || tvlMusd <= 0) return null;
  if (stakedLiquidity == null || stakedLiquidity <= 0n) return null;
  if (liquidity == null || liquidity <= 0n) return tvlMusd;

  const cappedStake = stakedLiquidity > liquidity ? liquidity : stakedLiquidity;
  const numerator = Number(cappedStake);
  const denominator = Number(liquidity);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const value = tvlMusd * (numerator / denominator);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeMezoPoolAprSnapshot(pool: MezoApiPool): MezoPoolAprSnapshot | null {
  const poolAddress = normalizeOptionalAddress(pool.address);
  if (!poolAddress) return null;

  const tvlMusd = normalizeNumber(pool.tvl);
  const stakedLiquidity = normalizeBigInt(pool.stakedLiquidity);
  const liquidity = normalizeBigInt(pool.liquidity);
  const emissionsAprPercent = normalizeApr(pool.emissionsApr);
  const activeStakedValueMusd = estimateApiPoolActiveStakedValueMusd({
    tvlMusd,
    stakedLiquidity,
    liquidity,
  });

  return {
    poolAddress,
    gaugeAddress: normalizeOptionalAddress(pool.gauge),
    aprPercent: normalizeApr(pool.stats?.apr),
    emissionsAprPercent,
    tvlMusd,
    activeStakedValueMusd,
    stakedLiquidity,
    liquidity,
    status: emissionsAprPercent == null ? "unavailable" : "available",
    unavailableReason:
      emissionsAprPercent == null
        ? "Mezo's pool API is not reporting MEZO emissions APR for this pool."
        : null,
  };
}

export function findMezoPoolAprSnapshot(
  pools: readonly MezoApiPool[],
  poolAddress: Address,
): MezoPoolAprSnapshot | null {
  const normalizedAddress = getAddress(poolAddress);
  for (const pool of pools) {
    const snapshot = normalizeMezoPoolAprSnapshot(pool);
    if (snapshot?.poolAddress.toLowerCase() === normalizedAddress.toLowerCase()) {
      return snapshot;
    }
  }
  return null;
}
