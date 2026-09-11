"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  findMezoPoolAprSnapshot,
  type MezoApiPool,
  type MezoPoolAprSnapshot,
} from "@/lib/liquidity/mezo-pools";
import { coreReadQueryOptions } from "@/lib/web3/read-query-options";
import type { AuroveLiquidityPairKey } from "@/lib/config/supported-liquidity-pools";
import type { SlipstreamPoolState } from "./slipstream-adapter";

type MezoPoolsResponse = {
  success?: boolean;
  data?: MezoApiPool[];
};

async function fetchMezoPools(): Promise<MezoApiPool[]> {
  const response = await fetch("/api/liquidity/mezo-pools", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Mezo pools request failed (${response.status})`);
  }

  const json = (await response.json()) as MezoPoolsResponse;
  return json.success && Array.isArray(json.data) ? json.data : [];
}

export function useClGaugeEmissionsApr(
  pairKey: AuroveLiquidityPairKey,
  pool: SlipstreamPoolState,
) {
  const enabled = Boolean(pool.address);
  const query = useQuery({
    queryKey: ["mezo-pool-emissions-apr", pairKey, pool.chainId, pool.address.toLowerCase()],
    queryFn: async (): Promise<MezoPoolAprSnapshot> => {
      const pools = await fetchMezoPools();
      const snapshot = findMezoPoolAprSnapshot(pools, pool.address);
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
    },
    ...coreReadQueryOptions,
    enabled,
  });

  return useMemo(() => query, [query]);
}
