"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { erc721Abi, type Abi, type Address } from "viem";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getKnownVeTokenConfigs } from "../data/known-addresses";
import type { TradeVeAssetType } from "../types";

const ERC721_ENUMERABLE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type UserVeToken = {
  assetType: TradeVeAssetType;
  contractAddress: Address;
  symbol: string;
  balance: bigint;
  balanceFormatted: string;
  tokenIds: bigint[];
};

type UseUserVeTokensResult = {
  veTokens: UserVeToken[];
  isConnected: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refresh: () => void;
};

type VeTokenCandidate = {
  assetType: TradeVeAssetType;
  contractAddress: Address;
};

function formatBalance(balance: bigint): string {
  return `${new Intl.NumberFormat("en-US").format(Number(balance))} veNFT${
    balance === 1n ? "" : "s"
  }`;
}

function parseReadError(value: unknown): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }
  return new Error("Unable to load ve token balances.");
}

export function useUserVeTokens(): UseUserVeTokensResult {
  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const candidates = useMemo<VeTokenCandidate[]>(
    () =>
      getKnownVeTokenConfigs(chainId).map((token) => ({
        assetType: token.assetType,
        contractAddress: token.address,
      })),
    [chainId],
  );
  const summaryContracts = useMemo(() => {
    if (!userAddress) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      chainId: number;
    }> = [];

    for (const candidate of candidates) {
      contracts.push({
        address: candidate.contractAddress,
        abi: erc721Abi,
        functionName: "symbol",
        chainId,
      });
      contracts.push({
        address: candidate.contractAddress,
        abi: erc721Abi,
        functionName: "balanceOf",
        args: [userAddress],
        chainId,
      });
    }

    return contracts;
  }, [candidates, chainId, userAddress]);

  const canReadSummaries = Boolean(userAddress && candidates.length > 0);
  const summaryReads = useReadContracts({
    allowFailure: true,
    contracts: summaryContracts,
    query: {
      enabled: canReadSummaries,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
    },
  });

  const ownedTokenSummaries = useMemo(() => {
    return candidates
      .map((candidate, index) => {
        const symbolResult = summaryReads.data?.[index * 2]?.result;
        const balanceResult = summaryReads.data?.[index * 2 + 1]?.result;
        const balance = typeof balanceResult === "bigint" ? balanceResult : 0n;

        return {
          ...candidate,
          symbol: typeof symbolResult === "string" ? symbolResult : candidate.assetType,
          balance,
        };
      })
      .filter((item) => item.balance > 0n);
  }, [candidates, summaryReads.data]);

  const tokenIdContracts = useMemo(() => {
    if (!userAddress) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      chainId: number;
    }> = [];

    for (const token of ownedTokenSummaries) {
      for (let index = 0; index < Number(token.balance); index += 1) {
        contracts.push({
          address: token.contractAddress,
          abi: ERC721_ENUMERABLE_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [userAddress, BigInt(index)],
          chainId,
        });
      }
    }

    return contracts;
  }, [chainId, ownedTokenSummaries, userAddress]);

  const canReadTokenIds = Boolean(userAddress && ownedTokenSummaries.length > 0);
  const tokenIdReads = useReadContracts({
    allowFailure: true,
    contracts: tokenIdContracts,
    query: {
      enabled: canReadTokenIds,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
    },
  });

  const veTokens = useMemo(() => {
    const tokenRanges = ownedTokenSummaries.map((token, index) => ({
      token,
      startIndex: ownedTokenSummaries
        .slice(0, index)
        .reduce((sum, previousToken) => sum + Number(previousToken.balance), 0),
    }));

    return tokenRanges.map(({ token, startIndex }) => {
      const tokenIds: bigint[] = [];
      for (let index = 0; index < Number(token.balance); index += 1) {
        const result = tokenIdReads.data?.[startIndex + index]?.result;
        if (typeof result === "bigint") {
          tokenIds.push(result);
        }
      }

      return {
        assetType: token.assetType,
        contractAddress: token.contractAddress,
        symbol: token.symbol,
        balance: token.balance,
        balanceFormatted: formatBalance(token.balance),
        tokenIds,
      } satisfies UserVeToken;
    });
  }, [ownedTokenSummaries, tokenIdReads.data]);

  const error =
    parseReadError(summaryReads.error) ||
    parseReadError(tokenIdReads.error) ||
    summaryReads.data?.find((item) => item.status === "failure")?.error ||
    tokenIdReads.data?.find((item) => item.status === "failure")?.error ||
    null;

  function refresh() {
    void summaryReads.refetch();
    void tokenIdReads.refetch();
  }

  return {
    veTokens,
    isConnected,
    isLoading:
      (canReadSummaries && summaryReads.isPending) || (canReadTokenIds && tokenIdReads.isPending),
    isFetching: summaryReads.isFetching || tokenIdReads.isFetching,
    error,
    refresh,
  };
}
