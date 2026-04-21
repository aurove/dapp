"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { executeAddressWrite, useTransactionFlowContext } from "@fractals/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getRuntimeConfig } from "@/lib/config/env";
import type {
  CreateVeTradeListingInput,
  TradeAsset,
  TradeChangeFilter,
  TradeSortOption,
} from "../types";
import { useChainId, usePublicClient } from "wagmi";

type ListingView = {
  listingId: bigint;
  tokenId: bigint;
  amountRemaining: bigint;
  paymentToken: `0x${string}`;
  pricePerUnit: bigint;
  totalPriceRemaining?: bigint;
};

const LISTINGS_PAGE_SIZE = BigInt(100);
const ERC20_DECIMALS_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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

function inferVeLabelFromUri(uri: string | undefined): string {
  if (!uri) return "veAsset";
  const normalized = uri.toLowerCase();
  if (normalized.includes("vebtc")) return "veBTC";
  if (normalized.includes("vemezo")) return "veMEZO";
  return "veAsset";
}

export function useTradeListing() {
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const txContext = useTransactionFlowContext();
  const runtime = getRuntimeConfig();

  const marketplace = getContractConfig(chainId, "Marketplace");
  const listingWrapper = getContractConfig(chainId, "VeNftFractionListing");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");
  const assetLedger = getContractConfig(chainId, "AssetLedger");

  const publicReadClient = usePublicClient({ chainId });

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<TradeSortOption>("price_desc");
  const [changeFilter, setChangeFilter] = useState<TradeChangeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listings, setListings] = useState<ListingView[]>([]);
  const [tokenUriMap, setTokenUriMap] = useState<Record<string, string>>({});
  const [paymentTokenDecimalsMap, setPaymentTokenDecimalsMap] = useState<Record<string, number>>(
    {},
  );
  const [defaultPaymentToken, setDefaultPaymentToken] = useState<`0x${string}` | null>(null);
  const [defaultPaymentTokenDecimals, setDefaultPaymentTokenDecimals] = useState<number>(18);
  const [reloadToken, setReloadToken] = useState(0);

  const refreshListing = useCallback(async () => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchChainData() {
      if (!publicReadClient || !marketplace?.address || !marketplace.abi) {
        if (!cancelled) {
          setListings([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const listingTuple = (await publicReadClient.readContract({
          address: marketplace.address,
          abi: marketplace.abi,
          functionName: "getActiveListings",
          args: [BigInt(0), LISTINGS_PAGE_SIZE],
        })) as readonly [readonly ListingView[], bigint, boolean];

        const chainListings = [...(listingTuple?.[0] ?? [])];
        const uniqueTrancheIds = [
          ...new Set(chainListings.map((item) => item.tokenId.toString())),
        ].map((v) => BigInt(v));
        const uniquePaymentTokens = [
          ...new Set(chainListings.map((item) => item.paymentToken.toLowerCase())),
        ] as `0x${string}`[];

        const [tokenUris, tokenDecimals, configuredDefaultToken] = await Promise.all([
          assetLedger?.address && assetLedger.abi
            ? Promise.all(
                uniqueTrancheIds.map(async (tokenId) => {
                  try {
                    const uri = (await publicReadClient.readContract({
                      address: assetLedger.address,
                      abi: assetLedger.abi,
                      functionName: "uri",
                      args: [tokenId],
                    })) as string;
                    return [tokenId.toString(), uri] as const;
                  } catch {
                    return [tokenId.toString(), ""] as const;
                  }
                }),
              )
            : Promise.resolve([] as ReadonlyArray<readonly [string, string]>),
          Promise.all(
            uniquePaymentTokens.map(async (token) => {
              try {
                const decimals = (await publicReadClient.readContract({
                  address: token,
                  abi: ERC20_DECIMALS_ABI,
                  functionName: "decimals",
                })) as number;
                return [token.toLowerCase(), Number(decimals)] as const;
              } catch {
                return [token.toLowerCase(), 18] as const;
              }
            }),
          ),
          paymentRouter?.address && paymentRouter.abi
            ? publicReadClient
                .readContract({
                  address: paymentRouter.address,
                  abi: paymentRouter.abi,
                  functionName: "MUSD",
                })
                .then((value) => value as `0x${string}`)
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        const resolvedDefaultToken =
          configuredDefaultToken ||
          (runtime.trading.defaultPaymentTokenAddress as `0x${string}` | null);
        let resolvedDefaultTokenDecimals = 18;
        if (resolvedDefaultToken) {
          try {
            resolvedDefaultTokenDecimals = Number(
              (await publicReadClient.readContract({
                address: resolvedDefaultToken,
                abi: ERC20_DECIMALS_ABI,
                functionName: "decimals",
              })) as number,
            );
          } catch {
            resolvedDefaultTokenDecimals = 18;
          }
        }

        if (cancelled) return;

        setListings(chainListings);
        setTokenUriMap(Object.fromEntries(tokenUris));
        setPaymentTokenDecimalsMap(Object.fromEntries(tokenDecimals));
        setDefaultPaymentToken(resolvedDefaultToken);
        setDefaultPaymentTokenDecimals(resolvedDefaultTokenDecimals);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchChainData();
    return () => {
      cancelled = true;
    };
  }, [
    assetLedger?.abi,
    assetLedger?.address,
    marketplace?.abi,
    marketplace?.address,
    paymentRouter?.abi,
    paymentRouter?.address,
    publicReadClient,
    reloadToken,
    runtime.trading.defaultPaymentTokenAddress,
  ]);

  const chainAssets = useMemo(() => {
    return listings.map((listing) => {
      const listingId = Number(listing.listingId);
      const tokenId = Number(listing.tokenId);
      const paymentTokenKey = listing.paymentToken.toLowerCase();
      const paymentDecimals = paymentTokenDecimalsMap[paymentTokenKey] ?? 18;
      const unitPrice = Number(formatUnits(listing.pricePerUnit, paymentDecimals));
      const amount = Number(formatUnits(listing.amountRemaining, 18));
      const uri = tokenUriMap[listing.tokenId.toString()];
      const veLabel = inferVeLabelFromUri(uri);
      const totalValue =
        typeof listing.totalPriceRemaining === "bigint"
          ? Number(formatUnits(listing.totalPriceRemaining, paymentDecimals))
          : unitPrice * amount;

      return {
        id: `listing-${listingId}`,
        name: `${veLabel} Fraction #${tokenId}`,
        symbol: `${veLabel}-${tokenId}`,
        thumbnail: veLabel === "veBTC" ? "🟧" : veLabel === "veMEZO" ? "🟩" : "🧩",
        priceUsd: unitPrice,
        volume24hUsd: totalValue,
        change24hPct: undefined,
        category: "locked",
      } satisfies TradeAsset;
    });
  }, [listings, paymentTokenDecimalsMap, tokenUriMap]);

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

    const paymentToken =
      defaultPaymentToken || (runtime.trading.defaultPaymentTokenAddress as `0x${string}` | null);
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

      await refreshListing();

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
    isLoading,
    refreshListing,
    createVeListing,
    isSubmittingListing,
    filteredAssets,
    totalCount: chainAssets.length,
  };
}
