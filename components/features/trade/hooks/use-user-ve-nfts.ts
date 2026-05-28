"use client";

import { useMemo } from "react";
import { type Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import type { TradeVeAssetType } from "../types";
import {
  formatCompactTokenAmount,
  formatLockEndLabel,
  parseReadError,
  toBigInt,
} from "../utils/read-parsers";

const MAX_TOKENS_PER_COLLECTION = 50;

type VeTokenCandidate = {
  assetType: TradeVeAssetType;
  contractAddress: Address;
  abi: Abi;
};

export type UserVeNft = {
  assetType: TradeVeAssetType;
  symbol: string;
  contractAddress: Address;
  tokenId: bigint;
  lockAmountRaw: bigint;
  lockAmountFormatted: string;
  lockEnd: bigint;
  lockEndLabel: string;
  isPermanent: boolean;
  availableFractionCapacityRaw: bigint;
  availableFractionCapacityFormatted: string;
};

export type UserVeNftCollection = {
  assetType: TradeVeAssetType;
  symbol: string;
  contractAddress: Address;
  balance: bigint;
  balanceFormatted: string;
  veNfts: UserVeNft[];
};

type UseUserVeNftsResult = {
  veCollections: UserVeNftCollection[];
  isConnected: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refresh: () => void;
};

function formatCount(balance: bigint): string {
  return `${new Intl.NumberFormat("en-US").format(Number(balance))} veNFT${balance === 1n ? "" : "s"}`;
}

function parseLockedBalance(value: unknown): { amount: bigint; end: bigint; isPermanent: boolean } {
  if (!value) {
    return { amount: 0n, end: 0n, isPermanent: false };
  }

  if (Array.isArray(value)) {
    return {
      amount: toBigInt(value[0]),
      end: toBigInt(value[1]),
      isPermanent: Boolean(value[2]),
    };
  }

  if (typeof value === "object") {
    const payload = value as { amount?: unknown; end?: unknown; isPermanent?: unknown };
    return {
      amount: toBigInt(payload.amount),
      end: toBigInt(payload.end),
      isPermanent: Boolean(payload.isPermanent),
    };
  }

  return { amount: 0n, end: 0n, isPermanent: false };
}

export function useUserVeNFTs(): UseUserVeNftsResult {
  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;

  const veBtc = getContractConfig(chainId, "VeBTC");
  const veMezo = getContractConfig(chainId, "VeMEZO");

  const candidates = useMemo<VeTokenCandidate[]>(() => {
    const items: VeTokenCandidate[] = [];

    if (veBtc?.address && veBtc.abi) {
      items.push({
        assetType: "veBTC",
        contractAddress: veBtc.address as Address,
        abi: veBtc.abi as Abi,
      });
    }

    if (veMezo?.address && veMezo.abi) {
      items.push({
        assetType: "veMEZO",
        contractAddress: veMezo.address as Address,
        abi: veMezo.abi as Abi,
      });
    }

    return items;
  }, [veBtc, veMezo]);

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
        abi: candidate.abi,
        functionName: "symbol",
        chainId,
      });
      contracts.push({
        address: candidate.contractAddress,
        abi: candidate.abi,
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
      ...detailReadQueryOptions,
    },
  });

  const ownedSummaries = useMemo(() => {
    return candidates
      .map((candidate, index) => {
        const symbolResult = summaryReads.data?.[index * 2]?.result;
        const balanceResult = summaryReads.data?.[index * 2 + 1]?.result;
        const rawBalance = typeof balanceResult === "bigint" ? balanceResult : 0n;
        const boundedBalance =
          rawBalance > BigInt(MAX_TOKENS_PER_COLLECTION)
            ? BigInt(MAX_TOKENS_PER_COLLECTION)
            : rawBalance;

        return {
          ...candidate,
          symbol: typeof symbolResult === "string" ? symbolResult : candidate.assetType,
          rawBalance,
          balance: boundedBalance,
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

    for (const token of ownedSummaries) {
      for (let index = 0; index < Number(token.balance); index += 1) {
        contracts.push({
          address: token.contractAddress,
          abi: token.abi,
          functionName: "ownerToNFTokenIdList",
          args: [userAddress, BigInt(index)],
          chainId,
        });
      }
    }

    return contracts;
  }, [chainId, ownedSummaries, userAddress]);

  const canReadTokenIds = Boolean(userAddress && ownedSummaries.length > 0);
  const tokenIdReads = useReadContracts({
    allowFailure: true,
    contracts: tokenIdContracts,
    query: {
      enabled: canReadTokenIds,
      ...detailReadQueryOptions,
    },
  });

  const tokenIdsByCollection = useMemo(() => {
    let cursor = 0;

    return ownedSummaries.map((summary) => {
      const tokenIds: bigint[] = [];

      for (let index = 0; index < Number(summary.balance); index += 1) {
        const result = tokenIdReads.data?.[cursor]?.result;
        cursor += 1;
        if (typeof result === "bigint") {
          tokenIds.push(result);
        }
      }

      return {
        summary,
        tokenIds,
      };
    });
  }, [ownedSummaries, tokenIdReads.data]);

  const lockContracts = useMemo(() => {
    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      chainId: number;
    }> = [];

    for (const collection of tokenIdsByCollection) {
      for (const tokenId of collection.tokenIds) {
        contracts.push({
          address: collection.summary.contractAddress,
          abi: collection.summary.abi,
          functionName: "locked",
          args: [tokenId],
          chainId,
        });
      }
    }

    return contracts;
  }, [chainId, tokenIdsByCollection]);

  const lockReads = useReadContracts({
    allowFailure: true,
    contracts: lockContracts,
    query: {
      enabled: lockContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const veCollections = useMemo<UserVeNftCollection[]>(() => {
    let lockCursor = 0;

    return tokenIdsByCollection.map(({ summary, tokenIds }) => {
      const veNfts: UserVeNft[] = tokenIds.map((tokenId) => {
        const lockResult = lockReads.data?.[lockCursor]?.result;
        lockCursor += 1;

        const locked = parseLockedBalance(lockResult);
        const lockAmount = locked.amount > 0n ? locked.amount : 0n;
        const capacity = lockAmount;

        return {
          assetType: summary.assetType,
          symbol: summary.symbol,
          contractAddress: summary.contractAddress,
          tokenId,
          lockAmountRaw: lockAmount,
          lockAmountFormatted: formatCompactTokenAmount(lockAmount, 18),
          lockEnd: locked.end,
          lockEndLabel: formatLockEndLabel(locked.end, locked.isPermanent),
          isPermanent: locked.isPermanent,
          availableFractionCapacityRaw: capacity,
          availableFractionCapacityFormatted: formatCompactTokenAmount(capacity, 18),
        };
      });

      return {
        assetType: summary.assetType,
        symbol: summary.symbol,
        contractAddress: summary.contractAddress,
        balance: summary.rawBalance,
        balanceFormatted: formatCount(summary.rawBalance),
        veNfts,
      };
    });
  }, [lockReads.data, tokenIdsByCollection]);

  const error =
    parseReadError(summaryReads.error, "Unable to load veNFT positions.") ||
    parseReadError(tokenIdReads.error, "Unable to load veNFT positions.") ||
    parseReadError(lockReads.error, "Unable to load veNFT positions.") ||
    summaryReads.data?.find((item) => item.status === "failure")?.error ||
    tokenIdReads.data?.find((item) => item.status === "failure")?.error ||
    lockReads.data?.find((item) => item.status === "failure")?.error ||
    null;

  function refresh() {
    void summaryReads.refetch();
    void tokenIdReads.refetch();
    void lockReads.refetch();
  }

  return {
    veCollections,
    isConnected,
    isLoading:
      (canReadSummaries && summaryReads.isPending) ||
      (canReadTokenIds && tokenIdReads.isPending) ||
      (lockContracts.length > 0 && lockReads.isPending),
    isFetching: summaryReads.isFetching || tokenIdReads.isFetching || lockReads.isFetching,
    error,
    refresh,
  };
}
