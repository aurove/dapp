"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { getContractConfig } from "@/contracts/client";
import { coreReadQueryOptions, detailReadQueryOptions } from "@/lib/web3/read-query-options";
import { buildTradeAssetViewModels } from "./view-model";
import {
  buildTradeBootstrapContracts,
  buildTradeMetadataContracts,
  parseActiveListingsReadResult,
} from "./contracts";
import type { TradeAsset } from "../types";
import { toAddress, toDecimals, toTokenSymbol } from "../utils/read-parsers";

type UseTradeMarketDataParams = {
  chainId: number;
  runtimeDefaultPaymentToken: Address | null;
};

type UseTradeMarketDataResult = {
  assets: TradeAsset[];
  defaultPaymentToken: Address | null;
  defaultPaymentTokenDecimals: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => void;
};

export function useTradeMarketData({
  chainId,
  runtimeDefaultPaymentToken,
}: UseTradeMarketDataParams): UseTradeMarketDataResult {
  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");
  const assetLedger = getContractConfig(chainId, "AssetLedger");

  const bootstrapContracts = useMemo(
    () => buildTradeBootstrapContracts({ marketplace, paymentRouter }),
    [marketplace, paymentRouter],
  );
  const canRunBootstrapReads = Boolean(marketplace?.address && marketplace.abi);

  const bootstrapReads = useReadContracts({
    allowFailure: true,
    contracts: bootstrapContracts,
    query: {
      enabled: canRunBootstrapReads,
      ...coreReadQueryOptions,
    },
  });

  const listings = useMemo(() => {
    const listingsResult = bootstrapReads.data?.[0]?.result;
    return parseActiveListingsReadResult(listingsResult);
  }, [bootstrapReads.data]);

  const routerDefaultPaymentToken = useMemo(() => {
    const paymentRouterPresent = Boolean(paymentRouter?.address && paymentRouter.abi);
    if (!paymentRouterPresent) return null;
    const readResult = bootstrapReads.data?.[1]?.result;
    return toAddress(readResult);
  }, [bootstrapReads.data, paymentRouter]);

  const resolvedDefaultPaymentToken = routerDefaultPaymentToken ?? runtimeDefaultPaymentToken;

  const uniqueTrancheIds = useMemo(
    () =>
      [...new Set(listings.map((listing) => listing.tokenId.toString()))].map((id) => BigInt(id)),
    [listings],
  );
  const uniquePaymentTokens = useMemo(
    () =>
      [
        ...new Set(
          listings
            .map((listing) => listing.paymentToken.toLowerCase())
            .filter((paymentToken): paymentToken is Address => paymentToken.startsWith("0x")),
        ),
      ] as Address[],
    [listings],
  );

  const metadataPlan = useMemo(
    () =>
      buildTradeMetadataContracts({
        assetLedger,
        trancheIds: uniqueTrancheIds,
        paymentTokens: uniquePaymentTokens,
        defaultPaymentToken: resolvedDefaultPaymentToken,
      }),
    [assetLedger, resolvedDefaultPaymentToken, uniquePaymentTokens, uniqueTrancheIds],
  );

  const canRunMetadataReads = canRunBootstrapReads && metadataPlan.contracts.length > 0;
  const metadataReads = useReadContracts({
    allowFailure: true,
    contracts: metadataPlan.contracts,
    query: {
      enabled: canRunMetadataReads,
      ...detailReadQueryOptions,
    },
  });

  const tokenUriMap = useMemo(() => {
    const entries: Array<readonly [string, string]> = [];
    for (let index = 0; index < metadataPlan.uriReads; index += 1) {
      const result = metadataReads.data?.[index]?.result;
      const tokenId = uniqueTrancheIds[index];
      entries.push([tokenId.toString(), typeof result === "string" ? result : ""]);
    }
    return Object.fromEntries(entries);
  }, [metadataPlan.uriReads, metadataReads.data, uniqueTrancheIds]);

  const paymentTokenDecimalsMap = useMemo(() => {
    const symbols: Array<readonly [string, string]> = [];
    const entries: Array<readonly [string, number]> = [];
    const offset = metadataPlan.uriReads;
    for (let index = 0; index < uniquePaymentTokens.length; index += 1) {
      const symbolResult = metadataReads.data?.[offset + index * 2]?.result;
      const decimalsResult = metadataReads.data?.[offset + index * 2 + 1]?.result;
      const token = uniquePaymentTokens[index]!;
      symbols.push([token.toLowerCase(), toTokenSymbol(symbolResult, token)]);
      entries.push([token.toLowerCase(), toDecimals(decimalsResult)]);
    }
    return {
      paymentTokenSymbolsMap: Object.fromEntries(symbols) as Record<string, string>,
      paymentTokenDecimalsMap: Object.fromEntries(entries) as Record<string, number>,
    };
  }, [metadataPlan.uriReads, metadataReads.data, uniquePaymentTokens]);

  const paymentTokenSymbolsMap = paymentTokenDecimalsMap.paymentTokenSymbolsMap;
  const decimalsByToken = paymentTokenDecimalsMap.paymentTokenDecimalsMap;

  const defaultPaymentTokenDecimals = useMemo(() => {
    if (!resolvedDefaultPaymentToken) {
      return 18;
    }

    const existingPaymentTokenDecimals = decimalsByToken[resolvedDefaultPaymentToken.toLowerCase()];
    if (typeof existingPaymentTokenDecimals === "number") {
      return existingPaymentTokenDecimals;
    }

    if (metadataPlan.defaultPaymentDecimalsReadIndex === null) {
      return 18;
    }

    const decimalsReadResult =
      metadataReads.data?.[metadataPlan.defaultPaymentDecimalsReadIndex]?.result;
    return toDecimals(decimalsReadResult);
  }, [
    decimalsByToken,
    metadataPlan.defaultPaymentDecimalsReadIndex,
    metadataReads.data,
    resolvedDefaultPaymentToken,
  ]);

  const assets = useMemo(
    () =>
      buildTradeAssetViewModels({
        listings,
        tokenUriMap,
        paymentTokenDecimalsMap: decimalsByToken,
        paymentTokenSymbolsMap,
      }),
    [decimalsByToken, listings, paymentTokenSymbolsMap, tokenUriMap],
  );

  const isLoading =
    (canRunBootstrapReads && bootstrapReads.isPending) ||
    (canRunMetadataReads && metadataReads.isPending);
  const isRefreshing = bootstrapReads.isFetching || metadataReads.isFetching;
  const error = (bootstrapReads.error as Error | null) ?? (metadataReads.error as Error | null);

  function refresh() {
    void bootstrapReads.refetch();
    void metadataReads.refetch();
  }

  return {
    assets,
    defaultPaymentToken: resolvedDefaultPaymentToken,
    defaultPaymentTokenDecimals,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
