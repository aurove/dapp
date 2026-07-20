"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";
import { useWalletPortfolio } from "@/features/portfolio";
import { loadSwapRegistry, readCachedSwapMarkets, withWalletVeNfts, writeCachedSwapMarkets } from "../registry";

const MARKET_STALE_TIME_MS = 5 * 60_000;
const MARKET_GC_TIME_MS = 30 * 60_000;

export function useSwapRegistry() {
  const chainId = useChainId();
  const client = usePublicClient();
  const wallet = useWalletPortfolio();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["swap", "registry", chainId] as const, [chainId]);
  useEffect(() => {
    if (queryClient.getQueryData(queryKey)) return;
    const cached = readCachedSwapMarkets(chainId);
    if (cached) queryClient.setQueryData(queryKey, cached);
  }, [chainId, queryClient, queryKey]);
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const registry = await loadSwapRegistry(client!, chainId);
      writeCachedSwapMarkets(registry);
      return registry;
    },
    enabled: Boolean(client),
    staleTime: MARKET_STALE_TIME_MS,
    gcTime: MARKET_GC_TIME_MS,
    refetchOnMount: true,
    placeholderData: (previous) => previous?.chainId === chainId ? previous : undefined,
    retry: 1,
  });
  const data = useMemo(() => withWalletVeNfts(query.data, wallet.data), [query.data, wallet.data]);
  return { ...query, data };
}
