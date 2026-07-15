"use client";

import { useEffect, useMemo } from "react";
import type { Address } from "viem";
import { useChainId } from "wagmi";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  type AurovePortfolioTokenSymbol,
  useAurovePortfolio,
} from "@/lib/web3/use-aurove-portfolio";
import { getKnownMezoTokenConfig, getKnownMezoTokenConfigs } from "./known-mezo-tokens";

type UseKnownMezoTokenBalanceParams = {
  ownerAddress?: Address;
  tokenAddress?: Address | null;
  tokenSymbol?: string;
  spenderAddress?: Address;
  chainId?: number;
};

function resolveKnownTokenSymbol(
  chainId: number,
  tokenAddress?: Address | null,
  tokenSymbol?: string,
): AurovePortfolioTokenSymbol | null {
  if (tokenSymbol) {
    const knownToken = getKnownMezoTokenConfig(chainId, tokenSymbol);
    if (knownToken) {
      return knownToken.symbol as AurovePortfolioTokenSymbol;
    }
  }

  if (!tokenAddress) return null;

  const normalizedAddress = tokenAddress.toLowerCase();
  const knownToken = getKnownMezoTokenConfigs(chainId).find(
    (item) => item.address.toLowerCase() === normalizedAddress,
  );
  return (knownToken?.symbol as AurovePortfolioTokenSymbol | undefined) ?? null;
}

export function useKnownMezoTokenBalance({
  ownerAddress,
  tokenAddress,
  tokenSymbol,
  spenderAddress,
  chainId,
}: UseKnownMezoTokenBalanceParams) {
  const connectedChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const resolvedChainId = chainId ?? connectedChainId ?? activeChain.id;
  const resolvedSymbol = useMemo(
    () => resolveKnownTokenSymbol(resolvedChainId, tokenAddress, tokenSymbol),
    [resolvedChainId, tokenAddress, tokenSymbol],
  );

  const portfolioQuery = useAurovePortfolio({
    ownerAddress,
    chainId: resolvedChainId,
    enabled: Boolean(ownerAddress && resolvedSymbol),
  });
  const tokenSnapshot = resolvedSymbol ? portfolioQuery.portfolio.tokens[resolvedSymbol] : null;

  useEffect(() => {
    if (!resolvedSymbol) {
      console.debug("[useKnownMezoTokenBalance] unresolved token symbol", {
        ownerAddress,
        chainId: resolvedChainId,
        tokenAddress,
        tokenSymbol,
        spenderAddress,
        isEnabled: Boolean(ownerAddress && resolvedSymbol),
      });
      return;
    }

    console.debug("[useKnownMezoTokenBalance] resolved request", {
      ownerAddress,
      chainId: resolvedChainId,
      tokenAddress,
      tokenSymbol,
      spenderAddress,
      resolvedSymbol,
      isEnabled: Boolean(ownerAddress && resolvedSymbol),
      isLoading: portfolioQuery.isLoading,
      isFetching: portfolioQuery.isFetching,
      error: portfolioQuery.error,
    });

    if (portfolioQuery.error) {
      console.error("[useKnownMezoTokenBalance] portfolio query error", {
        ownerAddress,
        chainId: resolvedChainId,
        tokenAddress,
        tokenSymbol,
        spenderAddress,
        resolvedSymbol,
        error: portfolioQuery.error,
      });
    }
  }, [
    ownerAddress,
    portfolioQuery.error,
    portfolioQuery.isFetching,
    portfolioQuery.isLoading,
    resolvedChainId,
    resolvedSymbol,
    spenderAddress,
    tokenAddress,
    tokenSymbol,
  ]);

  useEffect(() => {
    if (!tokenSnapshot || !resolvedSymbol) return;

    const snapshot = tokenSnapshot;

    console.debug("[useKnownMezoTokenBalance] token snapshot", {
      ownerAddress,
      chainId: resolvedChainId,
      tokenAddress,
      tokenSymbol,
      spenderAddress,
      resolvedSymbol,
      balanceRaw: snapshot.balanceRaw,
      allowanceRaw: snapshot.allowanceRaw,
      readAddress: snapshot.address,
    });
  }, [
    ownerAddress,
    resolvedChainId,
    resolvedSymbol,
    spenderAddress,
    tokenAddress,
    tokenSnapshot?.address,
    tokenSnapshot?.allowanceRaw,
    tokenSnapshot?.balanceRaw,
    tokenSymbol,
  ]);

  if (resolvedSymbol && tokenSnapshot) {
    return {
      balanceRaw: tokenSnapshot.balanceRaw,
      allowanceRaw: tokenSnapshot.allowanceRaw,
      isChecking: portfolioQuery.isLoading || portfolioQuery.isFetching,
      error: portfolioQuery.error,
      refresh: portfolioQuery.refresh,
      readAddress: tokenSnapshot.address,
    };
  }

  return {
    balanceRaw: 0n,
    allowanceRaw: 0n,
    isChecking: false,
    error: null,
    refresh: () => {
      void portfolioQuery.refresh();
    },
    readAddress: spenderAddress ?? tokenAddress ?? null,
  };
}
