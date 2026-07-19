"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { loadSwapRegistry, readCachedSwapMarkets, writeCachedSwapMarkets } from "../registry";

const MARKET_STALE_TIME_MS = 5 * 60_000;
const MARKET_GC_TIME_MS = 30 * 60_000;

export function useSwapRegistry() {
  const chainId = useChainId();
  const client = usePublicClient();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["swap", "registry", chainId, address?.toLowerCase()] as const, [address, chainId]);
  useEffect(() => {
    if (queryClient.getQueryData(queryKey)) return;
    const cached = readCachedSwapMarkets(chainId);
    if (cached) queryClient.setQueryData(queryKey, cached);
  }, [chainId, queryClient, queryKey]);
  return useQuery({
    queryKey,
    queryFn: async () => {
      const registry = await loadSwapRegistry(client!, chainId, address);
      writeCachedSwapMarkets(registry);
      return registry;
    },
    enabled: Boolean(client),
    staleTime: MARKET_STALE_TIME_MS,
    gcTime: MARKET_GC_TIME_MS,
    refetchOnMount: address ? "always" : true,
    placeholderData: (previous) => previous?.chainId === chainId ? previous : undefined,
    retry: 1,
  });
}
