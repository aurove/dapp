"use client";

import { useMemo } from "react";
import { erc721Abi, formatUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getKnownVeTokenConfigs } from "../data/known-addresses";
import type { TradeVeAssetType } from "../types";

const ERC721_ENUMERABLE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "index", type: "uint256" },
    ],
    name: "ownerToNFTokenIdList",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const VE_LOCKED_BALANCE_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "locked",
    outputs: [
      {
        components: [
          { internalType: "int128", name: "amount", type: "int128" },
          { internalType: "uint256", name: "end", type: "uint256" },
          { internalType: "bool", name: "isPermanent", type: "bool" },
        ],
        internalType: "struct IVotingEscrow.LockedBalance",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MAX_TOKENS_PER_COLLECTION = 50;

type VeTokenCandidate = {
  assetType: TradeVeAssetType;
  contractAddress: Address;
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

function formatCompactAmount(amount: bigint, decimals = 18): string {
  const full = formatUnits(amount, decimals);
  const [whole, fraction = ""] = full.split(".");
  const cleanFraction = fraction.replace(/0+$/, "").slice(0, 6);
  const compact = cleanFraction.length > 0 ? `${whole}.${cleanFraction}` : whole;
  const numeric = Number.parseFloat(compact);
  if (!Number.isFinite(numeric)) return compact;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(numeric);
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
  return new Error("Unable to load veNFT positions.");
}

function asBigInt(value: unknown): bigint {
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

function parseLockedBalance(value: unknown): { amount: bigint; end: bigint; isPermanent: boolean } {
  if (!value) {
    return { amount: 0n, end: 0n, isPermanent: false };
  }

  if (Array.isArray(value)) {
    return {
      amount: asBigInt(value[0]),
      end: asBigInt(value[1]),
      isPermanent: Boolean(value[2]),
    };
  }

  if (typeof value === "object") {
    const payload = value as { amount?: unknown; end?: unknown; isPermanent?: unknown };
    return {
      amount: asBigInt(payload.amount),
      end: asBigInt(payload.end),
      isPermanent: Boolean(payload.isPermanent),
    };
  }

  return { amount: 0n, end: 0n, isPermanent: false };
}

function formatLockEndLabel(lockEnd: bigint, isPermanent: boolean): string {
  if (isPermanent) return "Permanent lock";
  if (lockEnd <= 0n) return "No lock end";

  const millis = Number(lockEnd) * 1000;
  if (!Number.isFinite(millis) || millis <= 0) {
    return "Unknown lock end";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(millis));
}

export function useUserVeNFTs(): UseUserVeNftsResult {
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
          abi: ERC721_ENUMERABLE_ABI,
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
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
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
          abi: VE_LOCKED_BALANCE_ABI,
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
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
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
          lockAmountFormatted: formatCompactAmount(lockAmount, 18),
          lockEnd: locked.end,
          lockEndLabel: formatLockEndLabel(locked.end, locked.isPermanent),
          isPermanent: locked.isPermanent,
          availableFractionCapacityRaw: capacity,
          availableFractionCapacityFormatted: formatCompactAmount(capacity, 18),
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
    parseReadError(summaryReads.error) ||
    parseReadError(tokenIdReads.error) ||
    parseReadError(lockReads.error) ||
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
