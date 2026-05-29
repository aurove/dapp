"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

const CHAIN_TIME_STALE_MS = 10_000;
const CHAIN_TIME_REFETCH_MS = 15_000;

export function useChainTime() {
  const publicClient = usePublicClient();

  const block = useQuery({
    enabled: Boolean(publicClient),
    queryKey: ["chain-time", publicClient?.chain?.id ?? null],
    queryFn: async () => {
      if (!publicClient) {
        return null;
      }

      return publicClient.getBlock({ blockTag: "latest" });
    },
    staleTime: CHAIN_TIME_STALE_MS,
    gcTime: 5 * 60_000,
    refetchInterval: CHAIN_TIME_REFETCH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  return {
    blockNumber: block.data?.number ?? null,
    chainTimestamp: block.data?.timestamp ?? null,
    chainTimestampNumber: block.data?.timestamp === undefined ? null : Number(block.data.timestamp),
    isChainTimeLoading: block.isLoading,
    refetchChainTime: block.refetch,
  };
}
