"use client";

import { useMemo, useState } from "react";
import { erc20Abi, formatUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { TRADE_MARKET_SORT_OPTIONS } from "../constants";
import { LISTINGS_PAGE_SIZE, parseActiveListingsReadResult } from "../data/contracts";
import type {
  TradeMarket,
  TradeMarketBase,
  TradeMarketSortOption,
  TradeMarketState,
} from "../types";

type TradeListingTuple = {
  listingId: bigint;
  seller: Address;
  collection: Address;
  tokenId: bigint;
  amountRemaining: bigint;
  paymentToken: Address;
  pricePerUnit: bigint;
  totalPriceRemaining: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  expiry: bigint;
  status: number;
  isExpired: boolean;
  isActive: boolean;
};

type TradePaymentTokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
};

type FractionInfo = {
  address: Address;
  trancheId: bigint;
  symbol: string;
  base: TradeMarketBase;
};

const DEFAULT_DECIMALS = 18;
const FRACTION_DECIMALS = 18;

function inferFractionBase(symbol: string): TradeMarketBase {
  const normalized = symbol.toLowerCase();
  if (normalized.startsWith("fvebtc")) return "veBTC";
  if (normalized.startsWith("fvemezo")) return "veMEZO";
  return "veAsset";
}

function toAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  return value as Address;
}

function toTokenSymbol(value: unknown, fallbackAddress: Address): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return `${fallbackAddress.slice(0, 6)}...${fallbackAddress.slice(-4)}`;
}

function toDecimals(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return DEFAULT_DECIMALS;
}

function toSafeNumber(value: bigint, decimals: number): number {
  return Number(formatUnits(value, decimals));
}

function applyMarketSort(items: TradeMarket[], sortBy: TradeMarketSortOption): TradeMarket[] {
  return [...items].sort((a, b) => {
    const priceA = a.floorPrice ?? Number.POSITIVE_INFINITY;
    const priceB = b.floorPrice ?? Number.POSITIVE_INFINITY;

    switch (sortBy) {
      case "liquidity_desc":
        return b.quoteLiquidity - a.quoteLiquidity;
      case "liquidity_asc":
        return a.quoteLiquidity - b.quoteLiquidity;
      case "price_asc":
        return priceA - priceB;
      case "price_desc":
        return priceB - priceA;
      case "activity_desc":
        return b.recentActivity - a.recentActivity;
      case "activity_asc":
        return a.recentActivity - b.recentActivity;
      default:
        return 0;
    }
  });
}

export function useMarkets() {
  const txFlowChainId = useChainId();
  const { address: userAddress } = useAccount();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;

  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");
  const assetLedger = getContractConfig(chainId, "AssetLedger");

  const [query, setQuery] = useState("");
  const [fractionFilter, setFractionFilter] = useState<"all" | TradeMarketBase>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | TradeMarketState>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<TradeMarketSortOption>(TRADE_MARKET_SORT_OPTIONS[0]!.value);
  const [nowTimestamp] = useState(() => Math.floor(Date.now() / 1000));

  const canReadCore = Boolean(
    marketplace?.address && marketplace.abi && paymentRouter?.address && paymentRouter.abi,
  );
  const canReadLedger = Boolean(assetLedger?.address && assetLedger.abi);

  const bootstrapContracts = useMemo(() => {
    if (!canReadCore) return [];
    if (!marketplace?.address || !paymentRouter?.address) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      chainId: number;
    }> = [
      {
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "nextListingId",
        chainId,
      },
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
    ];

    if (canReadLedger && assetLedger?.address) {
      contracts.push({
        address: assetLedger.address,
        abi: assetLedger.abi,
        functionName: "assetFractionCount",
        chainId,
      });
    }

    return contracts;
  }, [assetLedger, canReadCore, canReadLedger, chainId, marketplace, paymentRouter]);

  const bootstrapReads = useReadContracts({
    allowFailure: true,
    contracts: bootstrapContracts,
    query: {
      enabled: canReadCore,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
    },
  });

  const nextListingId = (bootstrapReads.data?.[0]?.result as bigint | undefined) ?? 1n;
  const listingCount = nextListingId > 0n ? nextListingId - 1n : 0n;
  const supportedTokens = useMemo(() => {
    const value = bootstrapReads.data?.[1]?.result as unknown;
    if (!Array.isArray(value)) return [] as Address[];
    return value.filter((token): token is Address => typeof token === "string") as Address[];
  }, [bootstrapReads.data]);

  const btcAddress = toAddress(bootstrapReads.data?.[2]?.result);
  const mezoAddress = toAddress(bootstrapReads.data?.[3]?.result);
  const musdAddress = toAddress(bootstrapReads.data?.[4]?.result);
  const fractionCountResult = canReadLedger ? bootstrapReads.data?.[5]?.result : 0;
  const fractionCount =
    typeof fractionCountResult === "bigint"
      ? Number(fractionCountResult)
      : typeof fractionCountResult === "number"
        ? fractionCountResult
        : 0;

  const listingPageContracts = useMemo(() => {
    if (!canReadCore || listingCount === 0n) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: "getListings";
      args: readonly [bigint, bigint];
      chainId: number;
    }> = [];

    if (!marketplace?.address) return contracts;

    for (let cursor = 0n; cursor < listingCount; cursor += LISTINGS_PAGE_SIZE) {
      contracts.push({
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "getListings",
        args: [cursor, LISTINGS_PAGE_SIZE],
        chainId,
      });
    }

    return contracts;
  }, [canReadCore, chainId, listingCount, marketplace]);

  const listingReads = useReadContracts({
    allowFailure: true,
    contracts: listingPageContracts,
    query: {
      enabled: listingPageContracts.length > 0,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
    },
  });

  const allListings = useMemo(() => {
    const rows: TradeListingTuple[] = [];
    for (const result of listingReads.data ?? []) {
      rows.push(...parseActiveListingsReadResult(result.result));
    }
    return rows;
  }, [listingReads.data]);

  const fractionAddressContracts = useMemo(() => {
    if (!canReadLedger || fractionCount === 0) return [];

    return Array.from({ length: fractionCount }, (_, index) => ({
      address: assetLedger!.address,
      abi: assetLedger!.abi,
      functionName: "assetFractionAt",
      args: [BigInt(index)],
      chainId,
    }));
  }, [assetLedger, canReadLedger, chainId, fractionCount]);

  const fractionAddressReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddressContracts,
    query: {
      enabled: fractionAddressContracts.length > 0,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionAddresses = useMemo(
    () =>
      (fractionAddressReads.data ?? [])
        .map((entry) => toAddress(entry.result))
        .filter((address): address is Address => Boolean(address)),
    [fractionAddressReads.data],
  );

  const fractionMetaContracts = useMemo(
    () =>
      fractionAddresses.flatMap((fractionAddress) => [
        {
          address: fractionAddress,
          abi: erc20Abi,
          functionName: "symbol",
          chainId,
        },
        {
          address: fractionAddress,
          abi: erc20Abi,
          functionName: "name",
          chainId,
        },
        {
          address: fractionAddress,
          abi: erc20Abi,
          functionName: "decimals",
          chainId,
        },
        {
          address: fractionAddress,
          abi: [
            {
              type: "function",
              name: "trancheId",
              stateMutability: "view",
              inputs: [],
              outputs: [{ name: "", type: "uint256" }],
            },
          ] as const,
          functionName: "trancheId",
          chainId,
        },
      ]),
    [chainId, fractionAddresses],
  );

  const fractionMetaReads = useReadContracts({
    allowFailure: true,
    contracts: fractionMetaContracts,
    query: {
      enabled: fractionMetaContracts.length > 0,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractions = useMemo<FractionInfo[]>(() => {
    const items: FractionInfo[] = [];
    for (let index = 0; index < fractionAddresses.length; index += 1) {
      const cursor = index * 4;
      const symbolResult = fractionMetaReads.data?.[cursor]?.result;
      const trancheResult = fractionMetaReads.data?.[cursor + 3]?.result;
      const symbol =
        typeof symbolResult === "string" && symbolResult.trim().length > 0
          ? symbolResult.trim()
          : `fraction-${index + 1}`;
      const trancheId = typeof trancheResult === "bigint" ? trancheResult : BigInt(index + 1);

      items.push({
        address: fractionAddresses[index]!,
        trancheId,
        symbol,
        base: inferFractionBase(symbol),
      });
    }
    return items;
  }, [fractionAddresses, fractionMetaReads.data]);

  const paymentTokenMetadataContracts = useMemo(
    () =>
      supportedTokens.flatMap((token) => {
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
    [btcAddress, chainId, mezoAddress, supportedTokens],
  );

  const paymentTokenReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenMetadataContracts,
    query: {
      enabled: paymentTokenMetadataContracts.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const paymentTokens = useMemo<TradePaymentTokenInfo[]>(() => {
    const items: TradePaymentTokenInfo[] = [];
    let metadataCursor = 0;

    for (const token of supportedTokens) {
      const isBtc = token.toLowerCase() === btcAddress?.toLowerCase();
      const isMezo = token.toLowerCase() === mezoAddress?.toLowerCase();
      const isMusd = token.toLowerCase() === musdAddress?.toLowerCase();

      if (isBtc) {
        items.push({ address: token, symbol: "BTC", decimals: DEFAULT_DECIMALS });
        continue;
      }
      if (isMezo) {
        items.push({ address: token, symbol: "MEZO", decimals: DEFAULT_DECIMALS });
        continue;
      }

      const symbolResult = paymentTokenReads.data?.[metadataCursor]?.result;
      const decimalsResult = paymentTokenReads.data?.[metadataCursor + 1]?.result;
      metadataCursor += 2;

      items.push({
        address: token,
        symbol:
          typeof symbolResult === "string"
            ? symbolResult
            : isMusd
              ? "MUSD"
              : toTokenSymbol(symbolResult, token),
        decimals: toDecimals(decimalsResult),
      });
    }

    return items;
  }, [btcAddress, mezoAddress, musdAddress, paymentTokenReads.data, supportedTokens]);

  const balanceContracts = useMemo(() => {
    if (!assetLedger?.address || !assetLedger.abi || !userAddress || fractions.length === 0)
      return [];

    return fractions.map((fraction) => ({
      address: assetLedger.address,
      abi: assetLedger.abi,
      functionName: "balanceOf",
      args: [userAddress, fraction.trancheId],
      chainId,
    }));
  }, [assetLedger, chainId, fractions, userAddress]);

  const balanceReads = useReadContracts({
    allowFailure: true,
    contracts: balanceContracts,
    query: {
      enabled: balanceContracts.length > 0,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
    },
  });

  const balanceByTranche = useMemo(() => {
    const values = new Map<string, bigint>();
    for (let index = 0; index < fractions.length; index += 1) {
      const result = balanceReads.data?.[index]?.result;
      values.set(fractions[index]!.trancheId.toString(), typeof result === "bigint" ? result : 0n);
    }
    return values;
  }, [balanceReads.data, fractions]);

  const markets = useMemo<TradeMarket[]>(() => {
    if (fractions.length === 0 || paymentTokens.length === 0) return [];

    const activityCutoff = nowTimestamp - 24 * 60 * 60;

    const listingsByMarket = new Map<string, TradeListingTuple[]>();

    for (const listing of allListings) {
      const key = `${listing.tokenId.toString()}-${listing.paymentToken.toLowerCase()}`;
      const existing = listingsByMarket.get(key);
      if (existing) {
        existing.push(listing);
      } else {
        listingsByMarket.set(key, [listing]);
      }
    }

    const output: TradeMarket[] = [];

    for (const fraction of fractions) {
      for (const token of paymentTokens) {
        const marketListings =
          listingsByMarket.get(`${fraction.trancheId.toString()}-${token.address.toLowerCase()}`) ??
          [];
        if (marketListings.length === 0) continue;
        const activeListings = marketListings.filter((listing) => listing.isActive);
        const expiredListings = marketListings.filter((listing) => listing.isExpired);

        const sortedByPrice = [...activeListings].sort((a, b) =>
          a.pricePerUnit === b.pricePerUnit
            ? Number(a.listingId - b.listingId)
            : Number(a.pricePerUnit - b.pricePerUnit),
        );

        const quoteLiquidity = activeListings.reduce(
          (sum, listing) => sum + toSafeNumber(listing.totalPriceRemaining, token.decimals),
          0,
        );
        const totalListedSupply = activeListings.reduce(
          (sum, listing) => sum + toSafeNumber(listing.amountRemaining, FRACTION_DECIMALS),
          0,
        );
        const floorPrice =
          sortedByPrice.length > 0
            ? toSafeNumber(sortedByPrice[0]!.pricePerUnit, token.decimals)
            : null;
        const highestPrice =
          sortedByPrice.length > 0
            ? toSafeNumber(sortedByPrice[sortedByPrice.length - 1]!.pricePerUnit, token.decimals)
            : null;

        const recentActivity = marketListings.filter(
          (listing) =>
            Number(listing.createdAt) >= activityCutoff ||
            Number(listing.updatedAt) >= activityCutoff,
        ).length;

        const lastActivityAt = marketListings.reduce<number | null>((latest, listing) => {
          const candidate = Math.max(Number(listing.createdAt), Number(listing.updatedAt));
          if (latest === null || candidate > latest) return candidate;
          return latest;
        }, null);

        const rawUserPosition = balanceByTranche.get(fraction.trancheId.toString()) ?? 0n;
        const userPosition = toSafeNumber(rawUserPosition, FRACTION_DECIMALS);

        let state: TradeMarketState = "illiquid";
        if (activeListings.length > 0) {
          state = "active";
        } else if (expiredListings.length > 0) {
          state = "expired";
        }

        output.push({
          id: `${fraction.trancheId.toString()}-${token.address.toLowerCase()}`,
          pair: `${fraction.symbol}/${token.symbol}`,
          fractionSymbol: fraction.symbol,
          fractionAddress: fraction.address,
          trancheId: fraction.trancheId,
          fractionBase: fraction.base,
          paymentToken: token.address,
          paymentTokenSymbol: token.symbol,
          paymentTokenDecimals: token.decimals,
          state,
          totalListedSupply,
          quoteLiquidity,
          floorPrice,
          bestPrice: floorPrice,
          priceRangeLow: floorPrice,
          priceRangeHigh: highestPrice,
          activeListings: activeListings.length,
          expiredListings: expiredListings.length,
          recentActivity,
          lastActivityAt,
          userPosition,
          hasUserPosition: userPosition > 0,
          topListings: sortedByPrice.slice(0, 3).map((listing) => ({
            listingId: listing.listingId,
            seller: listing.seller,
            amount: toSafeNumber(listing.amountRemaining, FRACTION_DECIMALS),
            price: toSafeNumber(listing.pricePerUnit, token.decimals),
            expiry: Number(listing.expiry),
          })),
        });
      }
    }

    return output;
  }, [allListings, balanceByTranche, fractions, nowTimestamp, paymentTokens]);

  const filteredMarkets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = markets.filter((market) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        market.pair.toLowerCase().includes(normalizedQuery) ||
        market.fractionSymbol.toLowerCase().includes(normalizedQuery);
      const matchesFraction = fractionFilter === "all" || market.fractionBase === fractionFilter;
      const matchesPayment =
        paymentFilter === "all" ||
        market.paymentToken.toLowerCase() === paymentFilter.toLowerCase();
      const matchesState = stateFilter === "all" || market.state === stateFilter;
      const matchesActiveOnly = !activeOnly || market.state === "active";

      return matchesQuery && matchesFraction && matchesPayment && matchesState && matchesActiveOnly;
    });

    return applyMarketSort(result, sortBy);
  }, [activeOnly, fractionFilter, markets, paymentFilter, query, sortBy, stateFilter]);

  const isLoading =
    (canReadCore && bootstrapContracts.length > 0 && bootstrapReads.isPending) ||
    (listingPageContracts.length > 0 && listingReads.isPending) ||
    (fractionAddressContracts.length > 0 && fractionAddressReads.isPending) ||
    (fractionMetaContracts.length > 0 && fractionMetaReads.isPending) ||
    (paymentTokenMetadataContracts.length > 0 && paymentTokenReads.isPending) ||
    (balanceContracts.length > 0 && balanceReads.isPending);

  const isRefreshing =
    (canReadCore && bootstrapContracts.length > 0 && bootstrapReads.isFetching) ||
    (listingPageContracts.length > 0 && listingReads.isFetching) ||
    (fractionAddressContracts.length > 0 && fractionAddressReads.isFetching) ||
    (fractionMetaContracts.length > 0 && fractionMetaReads.isFetching) ||
    (paymentTokenMetadataContracts.length > 0 && paymentTokenReads.isFetching) ||
    (balanceContracts.length > 0 && balanceReads.isFetching);

  const error =
    (bootstrapReads.error as Error | null) ||
    (listingReads.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionMetaReads.error as Error | null) ||
    (paymentTokenReads.error as Error | null) ||
    (balanceReads.error as Error | null);

  function refreshMarkets() {
    void bootstrapReads.refetch();
    void listingReads.refetch();
    void fractionAddressReads.refetch();
    void fractionMetaReads.refetch();
    void paymentTokenReads.refetch();
    void balanceReads.refetch();
  }

  return {
    query,
    setQuery,
    fractionFilter,
    setFractionFilter,
    paymentFilter,
    setPaymentFilter,
    stateFilter,
    setStateFilter,
    activeOnly,
    setActiveOnly,
    sortBy,
    setSortBy,
    markets: filteredMarkets,
    totalCount: markets.length,
    paymentTokenOptions: paymentTokens,
    isLoading,
    isRefreshing,
    error,
    refreshMarkets,
  };
}
