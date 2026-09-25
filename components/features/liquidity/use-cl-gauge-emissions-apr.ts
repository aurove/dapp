"use client";

import { useMemo } from "react";

import {
  findMezoPoolAprSnapshot,
  type MezoPoolAprSnapshot,
} from "@/lib/liquidity/mezo-pools";
import type { AuroveLiquidityPairKey } from "@/lib/config/supported-liquidity-pools";
import type { SlipstreamPoolState } from "./slipstream-adapter";
import { useMezoPools } from "./use-mezo-pools";

export function useClGaugeEmissionsApr(
  _pairKey: AuroveLiquidityPairKey,
  pool: SlipstreamPoolState,
) {
  const enabled = Boolean(pool.address);
  const poolsQuery = useMezoPools(enabled);

  const data = useMemo((): MezoPoolAprSnapshot | undefined => {
    if (!enabled || !poolsQuery.data) return undefined;
    const snapshot = findMezoPoolAprSnapshot(poolsQuery.data, pool.address);
    if (snapshot) return snapshot;

    return {
      poolAddress: pool.address,
      gaugeAddress: null,
      aprPercent: null,
      emissionsAprPercent: null,
      tvlMusd: null,
      activeStakedValueMusd: null,
      stakedLiquidity: null,
      liquidity: null,
      status: "unavailable",
      unavailableReason: "Mezo's pool API does not include this Aurove pool yet.",
    };
  }, [enabled, pool.address, poolsQuery.data]);

  return useMemo(
    () => ({
      ...poolsQuery,
      data,
    }),
    [data, poolsQuery],
  );
}
