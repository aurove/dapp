"use client";

import { useQuery } from "@tanstack/react-query";

import { getMarketChainId } from "@/lib/market/config";
import { marketQueryKeys } from "@/lib/market/keys";
import {
  PROTOCOL_STATS_GC_MS,
  PROTOCOL_STATS_REFETCH_MS,
  PROTOCOL_STATS_STALE_MS,
} from "@/lib/protocol-stats/config";
import type { ProtocolStatsSnapshot } from "@/lib/protocol-stats/types";

async function fetchStats(): Promise<ProtocolStatsSnapshot> {
  const response = await fetch("/api/protocol/stats", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Protocol stats request failed (${response.status})`);
  }
  return (await response.json()) as ProtocolStatsSnapshot;
}

/** Shared protocol summary stats for the homepage (and future consumers). */
export function useProtocolStats() {
  const chainId = getMarketChainId();
  return useQuery({
    queryKey: marketQueryKeys.protocolStats(chainId),
    queryFn: fetchStats,
    staleTime: PROTOCOL_STATS_STALE_MS,
    gcTime: PROTOCOL_STATS_GC_MS,
    refetchInterval: PROTOCOL_STATS_REFETCH_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previous) => previous,
  });
}
