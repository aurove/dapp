"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import type { SwapExecutionPlan, SwapRegistry, SwapTradeType } from "../domain";
import { quoteSwap } from "../quoting";

export function useSwapQuote(params: { registry?: SwapRegistry; plan?: SwapExecutionPlan; tradeType: SwapTradeType; amount: bigint; account?: Address; slippageBps: number }) {
  const client = usePublicClient();
  const [debouncedAmount, setDebouncedAmount] = useState(params.amount);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(params.amount), 350);
    return () => clearTimeout(timer);
  }, [params.amount]);
  const hops = useMemo(() => params.plan?.type === "unsupported" ? [] : (params.plan?.hops ?? []), [params.plan]);
  const routeKey = useMemo(() => hops.map((hop) => `${hop.pool}:${hop.tokenIn}:${hop.tokenOut}`).join("|"), [hops]);
  const query = useQuery({
    queryKey: ["swap", "quote", params.registry?.revision, params.account?.toLowerCase(), params.tradeType, params.slippageBps, debouncedAmount.toString(), routeKey],
    queryFn: () => quoteSwap({ client: client!, registry: params.registry!, hops, tradeType: params.tradeType, amount: debouncedAmount }),
    enabled: Boolean(client && params.registry && hops.length && debouncedAmount > 0n && debouncedAmount === params.amount),
    staleTime: 15_000, gcTime: 60_000, retry: 1,
  });
  return { ...query, isDebouncing: debouncedAmount !== params.amount };
}
