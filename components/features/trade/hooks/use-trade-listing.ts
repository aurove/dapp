"use client";

import { useCallback, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { executeAddressWrite, useTransactionFlowContext } from "@fractals/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getRuntimeConfig } from "@/lib/config/env";
import { useChainId } from "wagmi";
import { useTradeMarketData } from "../data/use-trade-market-data";
import type {
  CreateVeTradeListingInput,
  TradeAsset,
  TradeChangeFilter,
  TradeSortOption,
} from "../types";

function applySort(items: TradeAsset[], sortBy: TradeSortOption): TradeAsset[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "price_desc":
        return b.priceUsd - a.priceUsd;
      case "price_asc":
        return a.priceUsd - b.priceUsd;
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "change_desc":
        return (b.change24hPct ?? 0) - (a.change24hPct ?? 0);
      case "change_asc":
        return (a.change24hPct ?? 0) - (b.change24hPct ?? 0);
      default:
        return 0;
    }
  });
}

export function useTradeListing() {
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const txContext = useTransactionFlowContext();
  const runtime = getRuntimeConfig();

  const listingWrapper = getContractConfig(chainId, "VeNftFractionListing");

  const {
    assets: chainAssets,
    defaultPaymentToken,
    defaultPaymentTokenDecimals,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useTradeMarketData({
    chainId,
    runtimeDefaultPaymentToken: runtime.trading.defaultPaymentTokenAddress as `0x${string}` | null,
  });

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<TradeSortOption>("price_desc");
  const [changeFilter, setChangeFilter] = useState<TradeChangeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);

  const refreshListing = useCallback(() => {
    refresh();
  }, [refresh]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = chainAssets.filter((asset) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.symbol.toLowerCase().includes(normalizedQuery);
      const matchesCategory = categoryFilter === "all" || asset.category === categoryFilter;
      const change = asset.change24hPct ?? 0;
      const matchesChange =
        changeFilter === "all" || (changeFilter === "gainers" ? change >= 0 : change < 0);
      return matchesQuery && matchesCategory && matchesChange;
    });

    return applySort(result, sortBy);
  }, [categoryFilter, changeFilter, chainAssets, query, sortBy]);

  async function createVeListing(input: CreateVeTradeListingInput) {
    if (!listingWrapper?.address || !listingWrapper.abi) {
      throw new Error("VeNftFractionListing contract is unavailable for the connected network.");
    }
    if (!txContext) {
      throw new Error("Connect your wallet to create a listing.");
    }

    const veNftAddress =
      input.veAssetType === "veBTC" ? runtime.trading.veBtcAddress : runtime.trading.veMezoAddress;
    if (!veNftAddress) {
      throw new Error(
        `Missing ${input.veAssetType} address. Set NEXT_PUBLIC_${input.veAssetType.toUpperCase()}_ADDRESS.`,
      );
    }

    const paymentToken = defaultPaymentToken;
    if (!paymentToken) {
      throw new Error(
        "No payment token configured. Set NEXT_PUBLIC_DEFAULT_PAYMENT_TOKEN_ADDRESS or configure PaymentRouter.MUSD.",
      );
    }

    const safeExpiryDays = Math.max(1, Math.floor(input.expiryDays));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + safeExpiryDays * 24 * 60 * 60);
    const listAmount = parseUnits(input.listAmount, 18);
    const pricePerUnit = parseUnits(input.unitPriceUsd, defaultPaymentTokenDecimals);

    setIsSubmittingListing(true);
    try {
      const txResult = await executeAddressWrite({
        key: "fractionalize-list",
        label: "Fractionalize and list",
        ctx: txContext,
        prev: [],
        address: listingWrapper.address,
        abi: listingWrapper.abi,
        variables: {
          functionName: "fractionalizeAndList",
          args: [
            veNftAddress as `0x${string}`,
            input.veNftTokenId,
            listAmount,
            paymentToken,
            pricePerUnit,
            expiry,
          ],
        },
      });

      refreshListing();

      return {
        id: txResult.hash,
        name: `${input.veAssetType} Fraction #${input.veNftTokenId.toString()}`,
        symbol: `${input.veAssetType}-${input.veNftTokenId.toString()}`,
        thumbnail: input.veAssetType === "veBTC" ? "🟧" : "🟩",
        priceUsd: Number(input.unitPriceUsd),
        volume24hUsd: 0,
        change24hPct: undefined,
        category: "locked",
      } satisfies TradeAsset;
    } finally {
      setIsSubmittingListing(false);
    }
  }

  return {
    query,
    setQuery,
    sortBy,
    setSortBy,
    changeFilter,
    setChangeFilter,
    categoryFilter,
    setCategoryFilter,
    isLoading: isLoading || isRefreshing,
    error,
    refreshListing,
    createVeListing,
    isSubmittingListing,
    filteredAssets,
    totalCount: chainAssets.length,
  };
}
