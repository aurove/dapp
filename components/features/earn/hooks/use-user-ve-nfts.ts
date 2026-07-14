"use client";

import { useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getActiveChain } from "@/lib/config/chains";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { getEarnProtocolRuntime, getEarnVariantConfig, veNftCollectionAbi } from "../protocol";
import {
  EARN_VARIANTS,
  type EarnVariant,
  getVariantAssetSymbol,
} from "../utils/tranche";

const MAX_TOKENS_PER_COLLECTION = 50;

type VeTokenCandidate = {
  variant: EarnVariant;
  contractAddress: Address;
  assetSymbol: "BTC" | "MEZO";
};

export type UserVeNft = {
  variant: EarnVariant;
  contractAddress: Address;
  tokenId: bigint;
  lockAmountRaw: bigint;
  lockAmountFormatted: string;
  lockEnd: bigint;
  lockEndLabel: string;
  isPermanent: boolean;
};

export type UserVeNftCollection = {
  variant: EarnVariant;
  assetSymbol: "BTC" | "MEZO";
  contractAddress: Address;
  balanceRaw: bigint;
  balanceFormatted: string;
  displayedCount: number;
  hiddenCount: number;
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

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function parseReadError(value: unknown, fallbackMessage: string): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }
  return new Error(fallbackMessage);
}

function formatCompactAmount(amount: bigint, decimals = 18): string {
  const full = formatUnits(amount, decimals);
  const [whole, fraction = ""] = full.split(".");
  const cleanFraction = fraction.replace(/0+$/, "").slice(0, 6);
  return cleanFraction.length > 0 ? `${whole}.${cleanFraction}` : whole;
}

function formatLockEndLabel(lockEnd: bigint, isPermanent: boolean): string {
  if (isPermanent) return "Permanent";
  if (lockEnd <= 0n) return "No end";

  const millis = Number(lockEnd) * 1000;
  if (!Number.isFinite(millis) || millis <= 0) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(millis));
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
  const connectedChainId = useChainId();
  const activeChain = getActiveChain();
  const chainId = connectedChainId ?? activeChain.id;
  const runtime = useMemo(() => getEarnProtocolRuntime(chainId), [chainId]);

  const candidates = useMemo<VeTokenCandidate[]>(() => {
    return EARN_VARIANTS.flatMap((variant) => {
      const config = getEarnVariantConfig(variant, runtime);
      if (!config.collectionAddress) return [];

      return [
        {
          variant,
          contractAddress: config.collectionAddress,
          assetSymbol: getVariantAssetSymbol(variant),
        },
      ];
    });
  }, [runtime]);

  const summaryContracts = useMemo(() => {
    if (!userAddress) return [];

    return candidates.map((candidate) => ({
      address: candidate.contractAddress,
      abi: veNftCollectionAbi,
      functionName: "balanceOf" as const,
      args: [userAddress] as const,
      chainId,
    }));
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
        const balanceResult = summaryReads.data?.[index]?.result;
        const rawBalance = typeof balanceResult === "bigint" ? balanceResult : 0n;
        const displayedCount = Math.min(Number(rawBalance), MAX_TOKENS_PER_COLLECTION);

        return {
          ...candidate,
          rawBalance,
          displayedCount,
          hiddenCount: Math.max(0, Number(rawBalance) - displayedCount),
        };
      })
      .filter((item) => item.rawBalance > 0n);
  }, [candidates, summaryReads.data]);

  const tokenIdContracts = useMemo(() => {
    if (!userAddress) return [];

    return ownedSummaries.flatMap((token) =>
      Array.from({ length: token.displayedCount }, (_, index) => ({
        address: token.contractAddress,
        abi: veNftCollectionAbi,
        functionName: "ownerToNFTokenIdList" as const,
        args: [userAddress, BigInt(index)] as const,
        chainId,
      })),
    );
  }, [chainId, ownedSummaries, userAddress]);

  const canReadTokenIds = Boolean(userAddress && ownedSummaries.length > 0);
  const tokenIdReads = useReadContracts({
    allowFailure: true,
    contracts: tokenIdContracts,
    query: {
      enabled: canReadTokenIds,
      ...staticReadQueryOptions,
    },
  });

  const lockedContracts = useMemo(() => {
    const contracts: Array<{
      address: Address;
      abi: typeof veNftCollectionAbi;
      functionName: "locked";
      args: readonly [bigint];
      chainId: number;
    }> = [];

    const tokenIdResults = tokenIdReads.data ?? [];
    let cursor = 0;

    for (const collection of ownedSummaries) {
      for (let index = 0; index < collection.displayedCount; index += 1) {
        const tokenId = toBigInt(tokenIdResults[cursor]?.result);
        cursor += 1;
        if (tokenId === 0n) continue;

        contracts.push({
          address: collection.contractAddress,
          abi: veNftCollectionAbi,
          functionName: "locked",
          args: [tokenId] as const,
          chainId,
        });
      }
    }

    return contracts;
  }, [chainId, ownedSummaries, tokenIdReads.data]);

  const lockedReads = useReadContracts({
    allowFailure: true,
    contracts: lockedContracts,
    query: {
      enabled: lockedContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const veCollections = useMemo<UserVeNftCollection[]>(() => {
    const tokenIdResults = tokenIdReads.data ?? [];
    const lockedResults = lockedReads.data ?? [];
    let tokenCursor = 0;
    let lockedCursor = 0;

    return ownedSummaries.map((collection) => {
      const veNfts: UserVeNft[] = [];

      for (let index = 0; index < collection.displayedCount; index += 1) {
        const tokenId = toBigInt(tokenIdResults[tokenCursor]?.result);
        tokenCursor += 1;
        if (tokenId === 0n) continue;

        const locked = parseLockedBalance(lockedResults[lockedCursor]?.result);
        lockedCursor += 1;

        veNfts.push({
          variant: collection.variant,
          contractAddress: collection.contractAddress,
          tokenId,
          lockAmountRaw: locked.amount,
          lockAmountFormatted: formatCompactAmount(locked.amount),
          lockEnd: locked.end,
          lockEndLabel: formatLockEndLabel(locked.end, locked.isPermanent),
          isPermanent: locked.isPermanent,
        });
      }

      return {
        variant: collection.variant,
        assetSymbol: collection.assetSymbol,
        contractAddress: collection.contractAddress,
        balanceRaw: collection.rawBalance,
        balanceFormatted: formatCompactAmount(collection.rawBalance),
        displayedCount: collection.displayedCount,
        hiddenCount: collection.hiddenCount,
        veNfts,
      };
    });
  }, [lockedReads.data, ownedSummaries, tokenIdReads.data]);

  const error =
    parseReadError(summaryReads.error, "Failed to read veNFT balances.") ||
    parseReadError(tokenIdReads.error, "Failed to read veNFT token ids.") ||
    parseReadError(lockedReads.error, "Failed to read veNFT lock data.");

  return {
    veCollections,
    isConnected,
    isLoading: summaryReads.isPending || tokenIdReads.isPending || lockedReads.isPending,
    isFetching: summaryReads.isFetching || tokenIdReads.isFetching || lockedReads.isFetching,
    error,
    refresh: () => {
      void summaryReads.refetch();
      void tokenIdReads.refetch();
      void lockedReads.refetch();
    },
  };
}
