"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormik } from "formik";
import { parseUnits, erc20Abi, type Address } from "viem";
import { executeAddressWrite, useTransactionFlowContext } from "@fractals/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getRuntimeConfig } from "@/lib/config/env";
import { useChainId, useReadContracts } from "wagmi";
import { useTradeMarketData } from "../data/use-trade-market-data";
import type {
  CreateVeTradeListingInput,
  TradeAsset,
  TradeChangeFilter,
  TradeSortOption,
} from "../types";

type TradePaymentTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

const NATIVE_TOKEN_DECIMALS = 18;

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
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");

  const {
    assets: chainAssets,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useTradeMarketData({
    chainId,
    runtimeDefaultPaymentToken: runtime.trading.defaultPaymentTokenAddress as `0x${string}` | null,
  });

  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const paymentTokenConfigContracts = useMemo(
    () =>
      paymentRouter?.address && paymentRouter.abi
        ? [
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "getSupportedTokens",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "BTC",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "MEZO",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "MUSD",
              chainId,
            },
          ]
        : [],
    [chainId, paymentRouter],
  );

  const paymentTokenConfigReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenConfigContracts,
    query: {
      enabled: Boolean(paymentRouter?.address && paymentRouter.abi),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const supportedPaymentTokens = useMemo(() => {
    const routerTokens = paymentTokenConfigReads.data?.[0]?.result;
    return Array.isArray(routerTokens)
      ? (routerTokens.filter((token): token is Address => typeof token === "string") as Address[])
      : ([] as Address[]);
  }, [paymentTokenConfigReads.data]);

  const btcAddress = paymentTokenConfigReads.data?.[1]?.result as Address | undefined;
  const mezoAddress = paymentTokenConfigReads.data?.[2]?.result as Address | undefined;
  const musdAddress = paymentTokenConfigReads.data?.[3]?.result as Address | undefined;
  const paymentTokenMetadataContracts = useMemo(
    () =>
      supportedPaymentTokens.flatMap((token) => {
        const isNativeLike =
          token.toLowerCase() === btcAddress?.toLowerCase() ||
          token.toLowerCase() === mezoAddress?.toLowerCase();
        if (isNativeLike) return [];

        return [
          {
            address: token,
            abi: erc20Abi,
            functionName: "symbol",
            chainId,
          },
          {
            address: token,
            abi: erc20Abi,
            functionName: "decimals",
            chainId,
          },
        ];
      }),
    [btcAddress, chainId, mezoAddress, supportedPaymentTokens],
  );

  const paymentTokenMetadataReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenMetadataContracts,
    query: {
      enabled: supportedPaymentTokens.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const paymentTokenOptions = useMemo<TradePaymentTokenOption[]>(() => {
    const options: TradePaymentTokenOption[] = [];
    let metadataCursor = 0;

    for (const token of supportedPaymentTokens) {
      const isBtc = token.toLowerCase() === btcAddress?.toLowerCase();
      const isMezo = token.toLowerCase() === mezoAddress?.toLowerCase();
      const isMusd = token.toLowerCase() === musdAddress?.toLowerCase();

      if (isBtc) {
        options.push({ address: token, symbol: "BTC", decimals: NATIVE_TOKEN_DECIMALS });
        continue;
      }
      if (isMezo) {
        options.push({ address: token, symbol: "MEZO", decimals: NATIVE_TOKEN_DECIMALS });
        continue;
      }

      const symbolResult = paymentTokenMetadataReads.data?.[metadataCursor]?.result;
      const decimalsResult = paymentTokenMetadataReads.data?.[metadataCursor + 1]?.result;
      metadataCursor += 2;

      options.push({
        address: token,
        symbol:
          typeof symbolResult === "string"
            ? symbolResult
            : isMusd
              ? "MUSD"
              : `${token.slice(0, 6)}...${token.slice(-4)}`,
        decimals:
          typeof decimalsResult === "number"
            ? decimalsResult
            : typeof decimalsResult === "bigint"
              ? Number(decimalsResult)
              : 18,
      });
    }

    return options;
  }, [
    supportedPaymentTokens,
    btcAddress,
    mezoAddress,
    musdAddress,
    paymentTokenMetadataReads.data,
  ]);
  const filterForm = useFormik({
    initialValues: {
      query: "",
      sortBy: "price_desc" as TradeSortOption,
      changeFilter: "all" as TradeChangeFilter,
      categoryFilter: "all",
    },
    onSubmit: () => undefined,
  });

  const query = filterForm.values.query;
  const sortBy = filterForm.values.sortBy;
  const changeFilter = filterForm.values.changeFilter;
  const categoryFilter = filterForm.values.categoryFilter;

  function setQuery(value: string) {
    void filterForm.setFieldValue("query", value);
  }

  function setSortBy(value: TradeSortOption) {
    void filterForm.setFieldValue("sortBy", value);
  }

  function setChangeFilter(value: TradeChangeFilter) {
    void filterForm.setFieldValue("changeFilter", value);
  }

  function setCategoryFilter(value: string) {
    void filterForm.setFieldValue("categoryFilter", value);
  }

  const refreshListing = useCallback(() => {
    refresh();
  }, [refresh]);
  const refreshPaymentTokens = useCallback(() => {
    void paymentTokenConfigReads.refetch();
    void paymentTokenMetadataReads.refetch();
  }, [paymentTokenConfigReads, paymentTokenMetadataReads]);

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

    if (!input.veNftAddress) {
      throw new Error("Missing selected ve token contract address.");
    }
    if (!input.paymentToken) {
      throw new Error(
        "No payment token selected. Configure PaymentRouter supported tokens and pick one.",
      );
    }

    const safeExpiryDays = Math.max(1, Math.floor(input.expiryDays));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + safeExpiryDays * 24 * 60 * 60);
    const listAmount = parseUnits(input.listAmount, 18);
    const pricePerUnit = parseUnits(input.unitPriceUsd, input.paymentTokenDecimals);

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
            input.veNftAddress,
            input.veNftTokenId,
            listAmount,
            input.paymentToken,
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
    paymentTokenOptions,
    isLoadingPaymentTokens: paymentTokenConfigReads.isPending || paymentTokenMetadataReads.isPending,
    isFetchingPaymentTokens:
      paymentTokenConfigReads.isFetching || paymentTokenMetadataReads.isFetching,
    paymentTokenError:
      (paymentTokenConfigReads.error as Error | null) ||
      (paymentTokenMetadataReads.error as Error | null),
    refreshPaymentTokens,
    createVeListing,
    isSubmittingListing,
    filteredAssets,
    totalCount: chainAssets.length,
  };
}
