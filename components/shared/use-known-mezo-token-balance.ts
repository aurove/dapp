"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useChainId } from "wagmi";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useWalletPortfolio } from "@/features/portfolio";
import { getKnownMezoTokenConfig, getKnownMezoTokenConfigs } from "./known-mezo-tokens";

type UseKnownMezoTokenBalanceParams = {
  tokenAddress?: Address | null;
  tokenSymbol?: string;
  chainId?: number;
};

function resolveKnownTokenSymbol(
  chainId: number,
  tokenAddress?: Address | null,
  tokenSymbol?: string,
): "BTC" | "MEZO" | "MUSD" | null {
  if (tokenSymbol) {
    const knownToken = getKnownMezoTokenConfig(chainId, tokenSymbol);
    if (knownToken) {
      return knownToken.symbol;
    }
  }

  if (!tokenAddress) return null;

  const normalizedAddress = tokenAddress.toLowerCase();
  const knownToken = getKnownMezoTokenConfigs(chainId).find(
    (item) => item.address.toLowerCase() === normalizedAddress,
  );
  return knownToken?.symbol ?? null;
}

export function useKnownMezoTokenBalance({
  tokenAddress,
  tokenSymbol,
  chainId,
}: UseKnownMezoTokenBalanceParams) {
  const connectedChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const resolvedChainId = chainId ?? connectedChainId ?? activeChain.id;
  const resolvedSymbol = useMemo(
    () => resolveKnownTokenSymbol(resolvedChainId, tokenAddress, tokenSymbol),
    [resolvedChainId, tokenAddress, tokenSymbol],
  );

  const portfolioQuery = useWalletPortfolio();
  const token = resolvedSymbol ? portfolioQuery.data?.assets[resolvedSymbol] : undefined;
  if (resolvedSymbol) {
    return {
      balanceRaw: token?.rawBalance ?? 0n,
      isChecking: portfolioQuery.isLoading || portfolioQuery.isFetching,
      error: portfolioQuery.error,
      refresh: async () => { await portfolioQuery.refetch(); },
      readAddress: token?.address ?? null,
    };
  }

  return {
    balanceRaw: 0n,
    isChecking: false,
    error: null,
    refresh: () => {
      void portfolioQuery.refetch();
    },
    readAddress: tokenAddress ?? null,
  };
}
