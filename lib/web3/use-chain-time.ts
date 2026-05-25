"use client";

import { useBlock } from "wagmi";

const CHAIN_TIME_REFETCH_MS = 4_000;

export function useChainTime() {
  const block = useBlock({
    watch: true,
    query: {
      staleTime: 0,
      refetchInterval: CHAIN_TIME_REFETCH_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });

  return {
    blockNumber: block.data?.number ?? null,
    chainTimestamp: block.data?.timestamp ?? null,
    chainTimestampNumber: block.data?.timestamp === undefined ? null : Number(block.data.timestamp),
    isChainTimeLoading: block.isLoading,
    refetchChainTime: block.refetch,
  };
}
