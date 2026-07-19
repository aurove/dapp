"use client";

import { useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";

import { getEarnProtocolConfig } from "@/contracts/earn";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useWalletPortfolio } from "@/features/portfolio";

type EarnVeAssetType = "veBTC" | "veMEZO";

export type UserVeNft = {
  assetType: EarnVeAssetType;
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
  assetType: EarnVeAssetType;
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

function formatCompactAmount(amount: bigint, decimals = 18): string {
  const full = formatUnits(amount, decimals);
  const [whole, fraction = ""] = full.split(".");
  const cleanFraction = fraction.replace(/0+$/, "").slice(0, 6);
  return cleanFraction.length > 0 ? `${whole}.${cleanFraction}` : whole;
}

function formatCompactTokenAmount(amount: bigint, decimals = 18): string {
  const parsed = Number.parseFloat(formatCompactAmount(amount, decimals));
  if (!Number.isFinite(parsed)) {
    return formatUnits(amount, decimals);
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(parsed);
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

function formatCount(balance: bigint): string {
  return `${new Intl.NumberFormat("en-US").format(Number(balance))} veNFT${balance === 1n ? "" : "s"}`;
}

export function useUserVeNFTs(): UseUserVeNftsResult {
  const { isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const veBtc = earnContracts.veBtc;
  const veMezo = earnContracts.veMezo;
  const portfolio = useWalletPortfolio();

  const veCollections = useMemo<UserVeNftCollection[]>(() => {
    const result: UserVeNftCollection[] = [];
    const collections = portfolio.data?.veCollections ?? {};

    const collectionEntries: Array<{
      assetType: EarnVeAssetType;
      contractAddress: Address | null;
      fallbackSymbol: string;
    }> = [
      {
        assetType: "veBTC",
        contractAddress: veBtc?.address ?? null,
        fallbackSymbol: "veBTC",
      },
      {
        assetType: "veMEZO",
        contractAddress: veMezo?.address ?? null,
        fallbackSymbol: "veMEZO",
      },
    ];

    for (const entry of collectionEntries) {
      const collection = collections[entry.assetType];
      if (!collection?.address) continue;
      const symbol = collection.symbol ?? entry.fallbackSymbol;

      result.push({
        assetType: entry.assetType,
        symbol,
        contractAddress: collection.address,
        balance: BigInt(collection.tokenIds.length),
        balanceFormatted: formatCount(BigInt(collection.tokenIds.length)),
        veNfts: Object.values(collection.positions).map((position) => ({
          assetType: entry.assetType,
          symbol,
          contractAddress: collection.address as Address,
          tokenId: position.tokenId,
          lockAmountRaw: position.lockAmountRaw,
          lockAmountFormatted: formatCompactTokenAmount(position.lockAmountRaw, 18),
          lockEnd: position.lockEnd,
          lockEndLabel: formatLockEndLabel(position.lockEnd, position.isPermanent),
          isPermanent: position.isPermanent,
          availableFractionCapacityRaw: position.availableFractionCapacityRaw,
          availableFractionCapacityFormatted: formatCompactTokenAmount(
            position.availableFractionCapacityRaw,
            18,
          ),
        })),
      });
    }

    return result;
  }, [portfolio.data?.veCollections, veBtc?.address, veMezo?.address]);

  return {
    veCollections,
    isConnected,
    isLoading: portfolio.isLoading,
    isFetching: portfolio.isFetching,
    error: portfolio.error,
    refresh: () => {
      void portfolio.refetch();
    },
  };
}
