import { getAddress, isAddress, type Address } from "viem";

export type MezoApiPool = {
  address?: unknown;
  tvl?: unknown;
  emissionsApr?: unknown;
  token0?: MezoApiPoolToken;
  token1?: MezoApiPoolToken;
  stats?: {
    apr?: unknown;
  };
  gauge?: unknown;
  type?: unknown;
  stakedLiquidity?: unknown;
  liquidity?: unknown;
};

export type MezoApiPoolToken = {
  address?: unknown;
  symbol?: unknown;
  decimals?: unknown;
  price?: unknown;
  reserve?: unknown;
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
  return parsed != null && parsed > 0 ? parsed / 100 : null;
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

/** Build token address → mUSD price map from Mezo pool API payloads. */
export function buildMezoTokenPriceMapMusd(
  pools: readonly MezoApiPool[],
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const pool of pools) {
    for (const token of [pool.token0, pool.token1]) {
      const address = normalizeOptionalAddress(token?.address);
      const price = normalizeNumber(token?.price);
      if (!address || price == null || price <= 0) continue;
      const key = address.toLowerCase();
      if (!prices.has(key)) prices.set(key, price);
    }
  }
  return prices;
}

export function estimateTokenAmountValueMusd(params: {
  amountRaw: bigint | null | undefined;
  decimals: number | null | undefined;
  priceMusd: number | null | undefined;
}): number | null {
  const { amountRaw, decimals, priceMusd } = params;
  if (amountRaw == null || amountRaw < 0n) return null;
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0) return null;
  if (priceMusd == null || !Number.isFinite(priceMusd) || priceMusd <= 0) return null;
  if (amountRaw === 0n) return 0;

  const amount = Number(amountRaw) / 10 ** decimals;
  if (!Number.isFinite(amount)) return null;
  const value = amount * priceMusd;
  return Number.isFinite(value) ? value : null;
}

/**
 * Position liquidity value in mUSD from deposited token amounts × Mezo API prices.
 * Falls back to liquidity share of pool TVL when amounts or prices are incomplete.
 */
export function estimatePositionLiquidityValueMusd(params: {
  amount0Raw: bigint | null | undefined;
  amount1Raw: bigint | null | undefined;
  decimals0: number | null | undefined;
  decimals1: number | null | undefined;
  token0: Address;
  token1: Address;
  positionLiquidity: bigint;
  priceByToken: ReadonlyMap<string, number>;
  poolTvlMusd: number | null | undefined;
  poolLiquidity: bigint | null | undefined;
}): number | null {
  const value0 = estimateTokenAmountValueMusd({
    amountRaw: params.amount0Raw,
    decimals: params.decimals0,
    priceMusd: params.priceByToken.get(params.token0.toLowerCase()) ?? null,
  });
  const value1 = estimateTokenAmountValueMusd({
    amountRaw: params.amount1Raw,
    decimals: params.decimals1,
    priceMusd: params.priceByToken.get(params.token1.toLowerCase()) ?? null,
  });

  if (value0 != null && value1 != null) {
    const total = value0 + value1;
    return Number.isFinite(total) && total >= 0 ? total : null;
  }

  if (
    params.poolTvlMusd == null ||
    params.poolTvlMusd <= 0 ||
    params.poolLiquidity == null ||
    params.poolLiquidity <= 0n ||
    params.positionLiquidity <= 0n
  ) {
    return null;
  }

  const cappedLiquidity =
    params.positionLiquidity > params.poolLiquidity
      ? params.poolLiquidity
      : params.positionLiquidity;
  const numerator = Number(cappedLiquidity);
  const denominator = Number(params.poolLiquidity);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const shareValue = params.poolTvlMusd * (numerator / denominator);
  return Number.isFinite(shareValue) && shareValue > 0 ? shareValue : null;
}
