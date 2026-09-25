"use client";

import { useQuery } from "@tanstack/react-query";

import type { MezoApiPool } from "@/lib/liquidity/mezo-pools";
import { coreReadQueryOptions } from "@/lib/web3/read-query-options";

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

/** Shared Mezo.org pools query used for APR and liquidity USD valuations. */
export function useMezoPools(enabled = true) {
  return useQuery({
    queryKey: ["mezo-pools"],
    queryFn: fetchMezoPools,
    ...coreReadQueryOptions,
    enabled,
  });
}
