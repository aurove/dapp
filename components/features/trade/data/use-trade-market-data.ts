"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { getContractConfig } from "@/contracts/client";
import { buildTradeAssetViewModels } from "./view-model";
import {
  buildTradeBootstrapContracts,
  buildTradeMetadataContracts,
  parseActiveListingsReadResult,
} from "./contracts";
import type { TradeAsset } from "../types";

const DEFAULT_DECIMALS = 18;

function toAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    return null;
  }
  return value as Address;
}

function toDecimals(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return DEFAULT_DECIMALS;
}

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
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
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
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
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
    const entries: Array<readonly [string, number]> = [];
    const offset = metadataPlan.uriReads;
    for (let index = 0; index < metadataPlan.paymentTokenReads; index += 1) {
      const result = metadataReads.data?.[offset + index]?.result;
      const token = uniquePaymentTokens[index];
      entries.push([token.toLowerCase(), toDecimals(result)]);
    }
    return Object.fromEntries(entries);
  }, [
    metadataPlan.paymentTokenReads,
    metadataPlan.uriReads,
    metadataReads.data,
    uniquePaymentTokens,
  ]);

  const defaultPaymentTokenDecimals = useMemo(() => {
    if (!resolvedDefaultPaymentToken) {
      return DEFAULT_DECIMALS;
    }

    const existingPaymentTokenDecimals =
      paymentTokenDecimalsMap[resolvedDefaultPaymentToken.toLowerCase()];
    if (typeof existingPaymentTokenDecimals === "number") {
      return existingPaymentTokenDecimals;
    }

    if (metadataPlan.defaultPaymentDecimalsReadIndex === null) {
      return DEFAULT_DECIMALS;
    }

    const decimalsReadResult =
      metadataReads.data?.[metadataPlan.defaultPaymentDecimalsReadIndex]?.result;
    return toDecimals(decimalsReadResult);
  }, [
    metadataPlan.defaultPaymentDecimalsReadIndex,
    metadataReads.data,
    paymentTokenDecimalsMap,
    resolvedDefaultPaymentToken,
  ]);

  const assets = useMemo(
    () =>
      buildTradeAssetViewModels({
        listings,
        tokenUriMap,
        paymentTokenDecimalsMap,
      }),
    [listings, paymentTokenDecimalsMap, tokenUriMap],
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
