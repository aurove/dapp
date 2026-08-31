"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import type { SwapRegistry, SwapTradeType } from "../domain";
import { quoteBestSwapRoute } from "../quoting";

export function useSwapQuote(params: {
  registry?: SwapRegistry;
  tokenIn?: Address;
  tokenOut?: Address;
  tradeType: SwapTradeType;
  amount: bigint;
  account?: Address;
  slippageBps: number;
  maxHops?: number;
}) {
  const client = usePublicClient();
  const [debouncedAmount, setDebouncedAmount] = useState(params.amount);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(params.amount), 350);
    return () => clearTimeout(timer);
  }, [params.amount]);
  const query = useQuery({
    queryKey: [
      "swap",
      "quote",
      params.registry?.revision,
      params.account?.toLowerCase(),
      params.tradeType,
      params.slippageBps,
      debouncedAmount.toString(),
      params.tokenIn?.toLowerCase(),
      params.tokenOut?.toLowerCase(),
      params.maxHops ?? params.registry?.routing.maxHops,
    ],
    queryFn: () =>
      quoteBestSwapRoute({
        client: client!,
        registry: params.registry!,
        tokenIn: params.tokenIn!,
        tokenOut: params.tokenOut!,
        tradeType: params.tradeType,
        amount: debouncedAmount,
        maxHops: params.maxHops,
      }),
    enabled: Boolean(
      client &&
      params.registry &&
      params.tokenIn &&
      params.tokenOut &&
      debouncedAmount > 0n &&
      debouncedAmount === params.amount,
    ),
    staleTime: 15_000,
    gcTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const routeResult = query.data;
  return {
    ...query,
    data: routeResult?.status === "success" ? routeResult.quote : undefined,
    routeResult,
    routeState: routeResult?.status,
    isDebouncing: debouncedAmount !== params.amount,
  };
}
