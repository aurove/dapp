"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { erc20Abi } from "viem";
import { useChainId, useReadContract } from "wagmi";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useWalletPortfolio } from "@/features/portfolio";
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

  const portfolioQuery = useWalletPortfolio();
  const token = resolvedSymbol ? portfolioQuery.data?.assets[resolvedSymbol] : undefined;
  const allowance = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: ownerAddress && spenderAddress ? [ownerAddress, spenderAddress] : undefined,
    chainId: resolvedChainId,
    query: { enabled: Boolean(ownerAddress && spenderAddress && token?.address) },
  });

  if (resolvedSymbol) {
    return {
      balanceRaw: token?.rawBalance ?? 0n,
      allowanceRaw: allowance.data ?? 0n,
      isChecking: portfolioQuery.isLoading || portfolioQuery.isFetching || allowance.isLoading || allowance.isFetching,
      error: portfolioQuery.error ?? allowance.error,
      refresh: async () => { await Promise.all([portfolioQuery.refetch(), allowance.refetch()]); },
      readAddress: token?.address ?? null,
    };
  }

  return {
    balanceRaw: 0n,
    allowanceRaw: 0n,
    isChecking: false,
    error: null,
    refresh: () => {
      void portfolioQuery.refetch();
    },
    readAddress: spenderAddress ?? tokenAddress ?? null,
  };
}
