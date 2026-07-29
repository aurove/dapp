"use client";

import { useQuery } from "@tanstack/react-query";

import {
  MARKET_PRICES_GC_MS,
  MARKET_PRICES_REFETCH_MS,
  MARKET_PRICES_STALE_MS,
  getMarketChainId,
} from "@/lib/market/config";
import { marketQueryKeys } from "@/lib/market/keys";
import type { MarketPricesSnapshot } from "@/lib/market/types";

async function fetchPrices(): Promise<MarketPricesSnapshot> {
  const response = await fetch("/api/market/prices", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Market prices request failed (${response.status})`);
  }
  return (await response.json()) as MarketPricesSnapshot;
}

/** Shared price feed for the global ticker (and future consumers). */
export function useMarketPrices() {
  const chainId = getMarketChainId();
  return useQuery({
    queryKey: marketQueryKeys.prices(chainId),
    queryFn: fetchPrices,
    staleTime: MARKET_PRICES_STALE_MS,
    gcTime: MARKET_PRICES_GC_MS,
    refetchInterval: MARKET_PRICES_REFETCH_MS,
    refetchOnWindowFocus: true,
    retry: 2,
    placeholderData: (previous) => previous,
  });
}
