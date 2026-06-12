"use client";

import { useMemo } from "react";
import { erc20Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { detailReadQueryOptions } from "@/lib/web3/read-query-options";
import { getKnownMezoTokenConfig } from "./known-mezo-tokens";

type UseKnownMezoTokenBalanceParams = {
  ownerAddress?: Address;
  tokenAddress?: Address;
  tokenSymbol?: string;
  spenderAddress?: Address;
  chainId?: number;
};

export function useKnownMezoTokenBalance({
  ownerAddress,
  tokenAddress,
  tokenSymbol,
  spenderAddress,
  chainId,
}: UseKnownMezoTokenBalanceParams) {
  const activeChainId = chainId ?? 0;
  const readAddress = useMemo(() => {
    if (tokenSymbol) {
      const knownToken = getKnownMezoTokenConfig(activeChainId, tokenSymbol);
      if (knownToken) {
        return knownToken.address;
      }
    }

    return tokenAddress ?? null;
  }, [activeChainId, tokenAddress, tokenSymbol]);

  type TokenRead = {
    address: Address;
    abi: typeof erc20Abi;
    functionName: "balanceOf" | "allowance";
    args: readonly [Address] | readonly [Address, Address];
    chainId: number;
  };

  const contracts = useMemo<TokenRead[]>(() => {
    if (!ownerAddress || !readAddress) return [];

    const reads: TokenRead[] = [
      {
        address: readAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [ownerAddress] as const,
        chainId: activeChainId,
      },
    ];

    if (spenderAddress) {
      reads.push({
        address: readAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [ownerAddress, spenderAddress] as const,
        chainId: activeChainId,
      });
    }

    return reads;
  }, [activeChainId, ownerAddress, readAddress, spenderAddress]);

  const reads = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: contracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const balanceRaw = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const allowanceRaw =
    spenderAddress && reads.data?.length > 1
      ? ((reads.data?.[1]?.result as bigint | undefined) ?? 0n)
      : 0n;

  return {
    balanceRaw,
    allowanceRaw,
    isChecking: reads.isPending || reads.isFetching,
    error: (reads.error as Error | null) ?? null,
    refresh: () => {
      void reads.refetch();
    },
    readAddress,
  };
}
