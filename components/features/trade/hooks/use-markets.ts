"use client";

import { useMemo, useState } from "react";
import { erc1155Abi, erc20Abi, formatUnits, zeroAddress, type Abi, type Address } from "viem";
import { useAccount, useBlock, useChainId, useReadContracts } from "wagmi";
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
import { getBestAsk, getBestBid, sortAsksByBestPrice, sortBidsByBestPrice } from "../utils/pricing";
import { decodeTrancheId, deriveFractionSymbol } from "../utils/tranche";

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
  sellerBalance?: bigint;
  executableAmount?: bigint;
  totalExecutablePrice?: bigint;
  isExecutable?: boolean;
};

type TradeBidTuple = {
  bidId: bigint;
  bidder: Address;
  collection: Address;
  tokenId: bigint;
  amountRemaining: bigint;
  paymentToken: Address;
  pricePerUnit: bigint;
  totalBidValueRemaining: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  expiry: bigint;
  status: number;
  isExpired: boolean;
  isActive: boolean;
  bidderPaymentBalance?: bigint;
  bidderPaymentAllowance?: bigint;
  executableAmount?: bigint;
  totalExecutableBidValue?: bigint;
  isExecutable?: boolean;
};

type TradePaymentTokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
};

type FractionInfo = {
  address: Address;
  trancheId: bigint;
  name: string;
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

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function quoteToFractionAmountRaw(paymentCapacityRaw: bigint, pricePerUnitRaw: bigint): bigint {
  if (paymentCapacityRaw <= 0n || pricePerUnitRaw <= 0n) return 0n;
  return (paymentCapacityRaw * 10n ** BigInt(FRACTION_DECIMALS)) / pricePerUnitRaw;
}

function buildFallbackFractionInfo(trancheId: bigint, address: Address): FractionInfo {
  const decoded = decodeTrancheId(trancheId);
  if (decoded) {
    const symbol = deriveFractionSymbol(decoded.variant, decoded.trancheNumber);
    return {
      address,
      trancheId,
      name: symbol,
      symbol,
      base: decoded.variant,
    };
  }

  return {
    address,
    trancheId,
    name: `Unknown tranche #${trancheId.toString()}`,
    symbol: `TRANCHE-${trancheId.toString()}`,
    base: "veAsset",
  };
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

function parseBidsReadResult(value: unknown): TradeBidTuple[] {
  const tuple = value as readonly [readonly TradeBidTuple[], bigint, boolean] | undefined;
  if (!tuple || !Array.isArray(tuple[0])) {
    return [];
  }
  return [...tuple[0]];
}

function buildMarketId(fraction: FractionInfo, token: TradePaymentTokenInfo): string {
  return `${fraction.symbol}-${token.symbol}`;
}

export function useMarkets() {
  const txFlowChainId = useChainId();
  const { address: userAddress } = useAccount();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const blockRead = useBlock({
    chainId,
    watch: true,
    query: {
      staleTime: 5_000,
    },
  });

  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");
  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const paymentRouterAddress = paymentRouter?.address;

  const [query, setQuery] = useState("");
  const [fractionFilter, setFractionFilter] = useState<"all" | TradeMarketBase>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | TradeMarketState>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<TradeMarketSortOption>(TRADE_MARKET_SORT_OPTIONS[0]!.value);
  const [nowTimestamp] = useState(() => Math.floor(Date.now() / 1000));
  const chainTimestamp =
    typeof blockRead.data?.timestamp === "bigint"
      ? Number(blockRead.data.timestamp)
      : typeof blockRead.data?.timestamp === "number"
        ? blockRead.data.timestamp
        : null;

  const canReadCore = Boolean(
    marketplace?.address && marketplace.abi && paymentRouter?.address && paymentRouter.abi,
  );
  const canReadLedger = Boolean(assetLedger?.address && assetLedger.abi);

  const bootstrapContracts = useMemo(() => {
    if (!canReadCore || !marketplace?.address || !paymentRouter?.address) return [];

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
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "nextBidId",
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
  const nextBidId = (bootstrapReads.data?.[1]?.result as bigint | undefined) ?? 1n;
  const bidCount = nextBidId > 0n ? nextBidId - 1n : 0n;

  const supportedTokens = useMemo(() => {
    const value = bootstrapReads.data?.[2]?.result as unknown;
    if (!Array.isArray(value)) return [] as Address[];
    return value.filter((token): token is Address => typeof token === "string") as Address[];
  }, [bootstrapReads.data]);

  const btcAddress = toAddress(bootstrapReads.data?.[3]?.result);
  const mezoAddress = toAddress(bootstrapReads.data?.[4]?.result);
  const musdAddress = toAddress(bootstrapReads.data?.[5]?.result);
  const fractionCountResult = canReadLedger ? bootstrapReads.data?.[6]?.result : 0;
  const fractionCount =
    typeof fractionCountResult === "bigint"
      ? Number(fractionCountResult)
      : typeof fractionCountResult === "number"
        ? fractionCountResult
        : 0;

  const listingPageContracts = useMemo(() => {
    if (!canReadCore || listingCount === 0n || !marketplace?.address) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: "getListings";
      args: readonly [bigint, bigint];
      chainId: number;
    }> = [];

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

  const bidPageContracts = useMemo(() => {
    if (!canReadCore || bidCount === 0n || !marketplace?.address) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: "getBids";
      args: readonly [bigint, bigint];
      chainId: number;
    }> = [];

    for (let cursor = 0n; cursor < bidCount; cursor += LISTINGS_PAGE_SIZE) {
      contracts.push({
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "getBids",
        args: [cursor, LISTINGS_PAGE_SIZE],
        chainId,
      });
    }

    return contracts;
  }, [bidCount, canReadCore, chainId, marketplace]);

  const bidReads = useReadContracts({
    allowFailure: true,
    contracts: bidPageContracts,
    query: {
      enabled: bidPageContracts.length > 0,
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

  const allBids = useMemo(() => {
    const rows: TradeBidTuple[] = [];
    for (const result of bidReads.data ?? []) {
      rows.push(...parseBidsReadResult(result.result));
    }
    return rows;
  }, [bidReads.data]);

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
      const nameResult = fractionMetaReads.data?.[cursor + 1]?.result;
      const trancheResult = fractionMetaReads.data?.[cursor + 3]?.result;
      const symbol =
        typeof symbolResult === "string" && symbolResult.trim().length > 0
          ? symbolResult.trim()
          : `fraction-${index + 1}`;
      const name =
        typeof nameResult === "string" && nameResult.trim().length > 0 ? nameResult.trim() : symbol;
      const trancheId = typeof trancheResult === "bigint" ? trancheResult : BigInt(index + 1);

      items.push({
        address: fractionAddresses[index]!,
        trancheId,
        name,
        symbol,
        base: inferFractionBase(symbol),
      });
    }
    return items;
  }, [fractionAddresses, fractionMetaReads.data]);

  const marketTrancheIds = useMemo(() => {
    const ids = new Map<string, bigint>();
    for (const fraction of fractions) {
      ids.set(fraction.trancheId.toString(), fraction.trancheId);
    }
    for (const listing of allListings) {
      const key = listing.tokenId.toString();
      if (!ids.has(key)) ids.set(key, listing.tokenId);
    }
    for (const bid of allBids) {
      const key = bid.tokenId.toString();
      if (!ids.has(key)) ids.set(key, bid.tokenId);
    }
    return [...ids.values()];
  }, [allBids, allListings, fractions]);

  const marketFractions = useMemo(() => {
    const knownFractionsByTrancheId = new Map(
      fractions.map((fraction) => [fraction.trancheId.toString(), fraction] as const),
    );
    const fallbackAddress = assetLedger?.address ?? zeroAddress;

    return marketTrancheIds.map((trancheId) => {
      const existingFraction = knownFractionsByTrancheId.get(trancheId.toString());
      if (existingFraction) return existingFraction;
      return buildFallbackFractionInfo(trancheId, fallbackAddress);
    });
  }, [assetLedger?.address, fractions, marketTrancheIds]);

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
    if (!assetLedger?.address || !assetLedger.abi || !userAddress || marketFractions.length === 0)
      return [];

    return marketFractions.map((fraction) => ({
      address: assetLedger.address,
      abi: assetLedger.abi,
      functionName: "balanceOf",
      args: [userAddress, fraction.trancheId],
      chainId,
    }));
  }, [assetLedger, chainId, marketFractions, userAddress]);

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
    for (let index = 0; index < marketFractions.length; index += 1) {
      const result = balanceReads.data?.[index]?.result;
      values.set(
        marketFractions[index]!.trancheId.toString(),
        typeof result === "bigint" ? result : 0n,
      );
    }
    return values;
  }, [balanceReads.data, marketFractions]);

  const activeSellerInventoryListings = useMemo(
    () => allListings.filter((listing) => listing.isActive),
    [allListings],
  );

  const sellerInventoryContracts = useMemo(() => {
    if (activeSellerInventoryListings.length === 0) return [];

    return activeSellerInventoryListings.map((listing) => ({
      address: listing.collection,
      abi: erc1155Abi,
      functionName: "balanceOf",
      args: [listing.seller, listing.tokenId],
      chainId,
    }));
  }, [activeSellerInventoryListings, chainId]);

  const sellerInventoryReads = useReadContracts({
    allowFailure: true,
    contracts: sellerInventoryContracts,
    query: {
      enabled: sellerInventoryContracts.length > 0,
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchInterval: 15_000,
    },
  });

  const sellerBalanceByListingId = useMemo(() => {
    const values = new Map<string, bigint>();

    for (let index = 0; index < activeSellerInventoryListings.length; index += 1) {
      const result = sellerInventoryReads.data?.[index]?.result;
      if (typeof result === "bigint") {
        values.set(activeSellerInventoryListings[index]!.listingId.toString(), result);
      }
    }

    return values;
  }, [activeSellerInventoryListings, sellerInventoryReads.data]);

  const activeBidFundingBids = useMemo(
    () =>
      allBids.filter(
        (bid) => bid.isActive && bid.paymentToken.toLowerCase() !== btcAddress?.toLowerCase(),
      ),
    [allBids, btcAddress],
  );

  const bidFundingContracts = useMemo(() => {
    if (!paymentRouterAddress || activeBidFundingBids.length === 0) return [];

    return activeBidFundingBids.flatMap((bid) => [
      {
        address: bid.paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [bid.bidder],
        chainId,
      },
      {
        address: bid.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [bid.bidder, paymentRouterAddress],
        chainId,
      },
    ]);
  }, [activeBidFundingBids, chainId, paymentRouterAddress]);

  const bidFundingReads = useReadContracts({
    allowFailure: true,
    contracts: bidFundingContracts,
    query: {
      enabled: bidFundingContracts.length > 0,
      staleTime: 10_000,
      gcTime: 5 * 60_000,
      refetchInterval: 15_000,
    },
  });

  const bidderFundingByBidId = useMemo(() => {
    const values = new Map<string, { balance: bigint; allowance: bigint }>();

    for (let index = 0; index < activeBidFundingBids.length; index += 1) {
      const balanceResult = bidFundingReads.data?.[index * 2]?.result;
      const allowanceResult = bidFundingReads.data?.[index * 2 + 1]?.result;

      if (typeof balanceResult === "bigint" && typeof allowanceResult === "bigint") {
        values.set(activeBidFundingBids[index]!.bidId.toString(), {
          balance: balanceResult,
          allowance: allowanceResult,
        });
      }
    }

    return values;
  }, [activeBidFundingBids, bidFundingReads.data]);

  const markets = useMemo<TradeMarket[]>(() => {
    if (marketFractions.length === 0 || paymentTokens.length === 0) return [];

    const activityCutoff = nowTimestamp - 24 * 60 * 60;
    const listingsByMarket = new Map<string, TradeListingTuple[]>();
    const bidsByMarket = new Map<string, TradeBidTuple[]>();

    for (const listing of allListings) {
      const key = `${listing.tokenId.toString()}-${listing.paymentToken.toLowerCase()}`;
      const existing = listingsByMarket.get(key);
      if (existing) {
        existing.push(listing);
      } else {
        listingsByMarket.set(key, [listing]);
      }
    }

    for (const bid of allBids) {
      const key = `${bid.tokenId.toString()}-${bid.paymentToken.toLowerCase()}`;
      const existing = bidsByMarket.get(key);
      if (existing) {
        existing.push(bid);
      } else {
        bidsByMarket.set(key, [bid]);
      }
    }

    const output: TradeMarket[] = [];

    for (const fraction of marketFractions) {
      for (const token of paymentTokens) {
        const marketKey = `${fraction.trancheId.toString()}-${token.address.toLowerCase()}`;
        const marketListings = listingsByMarket.get(marketKey) ?? [];
        const marketBids = bidsByMarket.get(marketKey) ?? [];
        if (marketListings.length === 0 && marketBids.length === 0) continue;

        const activeListings = marketListings.filter((listing) => listing.isActive);
        const expiredListings = marketListings.filter((listing) => listing.isExpired);
        const activeBids = marketBids.filter((bid) => bid.isActive);
        const expiredBids = marketBids.filter((bid) => bid.isExpired);

        const executableListings = activeListings
          .map((listing) => {
            const sellerBalance = sellerBalanceByListingId.get(listing.listingId.toString());
            const executableAmount =
              typeof listing.executableAmount === "bigint"
                ? listing.executableAmount
                : sellerBalance === undefined
                  ? listing.amountRemaining
                  : minBigint(listing.amountRemaining, sellerBalance);
            const effectiveSellerBalance =
              typeof listing.sellerBalance === "bigint"
                ? listing.sellerBalance
                : sellerBalance === undefined
                  ? null
                  : sellerBalance;

            return {
              ...listing,
              executableAmount,
              sellerBalance: effectiveSellerBalance,
              isInventoryStale:
                effectiveSellerBalance !== null && effectiveSellerBalance < listing.amountRemaining,
            };
          })
          .filter((listing) => listing.executableAmount > 0n);

        const asksSortedByPrice = sortAsksByBestPrice(executableListings);
        const executableBids = activeBids
          .map((bid) => {
            const funding = bidderFundingByBidId.get(bid.bidId.toString());
            const executableAmount =
              typeof bid.executableAmount === "bigint"
                ? bid.executableAmount
                : funding === undefined
                  ? bid.amountRemaining
                  : minBigint(
                      bid.amountRemaining,
                      quoteToFractionAmountRaw(
                        minBigint(funding.balance, funding.allowance),
                        bid.pricePerUnit,
                      ),
                    );
            const bidderPaymentBalance =
              typeof bid.bidderPaymentBalance === "bigint"
                ? bid.bidderPaymentBalance
                : (funding?.balance ?? null);
            const bidderPaymentAllowance =
              typeof bid.bidderPaymentAllowance === "bigint"
                ? bid.bidderPaymentAllowance
                : (funding?.allowance ?? null);

            return {
              ...bid,
              executableAmount,
              bidderPaymentBalance,
              bidderPaymentAllowance,
              isFundingStale: executableAmount < bid.amountRemaining,
            };
          })
          .filter((bid) => bid.executableAmount > 0n);

        const bidsSortedByPrice = sortBidsByBestPrice(executableBids);
        const bestAsk = getBestAsk(asksSortedByPrice);
        const bestBid = getBestBid(bidsSortedByPrice);

        const quoteLiquidity = executableListings.reduce(
          (sum, listing) =>
            sum +
            toSafeNumber(
              (listing.executableAmount * listing.pricePerUnit) / 10n ** BigInt(FRACTION_DECIMALS),
              token.decimals,
            ),
          0,
        );
        const quoteDemand = executableBids.reduce(
          (sum, bid) =>
            sum +
            toSafeNumber(
              (bid.executableAmount * bid.pricePerUnit) / 10n ** BigInt(FRACTION_DECIMALS),
              token.decimals,
            ),
          0,
        );
        const totalListedSupply = executableListings.reduce(
          (sum, listing) => sum + toSafeNumber(listing.executableAmount, FRACTION_DECIMALS),
          0,
        );

        const floorPrice = bestAsk ? toSafeNumber(bestAsk.pricePerUnit, token.decimals) : null;
        const highestAskPrice =
          asksSortedByPrice.length > 0
            ? toSafeNumber(
                asksSortedByPrice[asksSortedByPrice.length - 1]!.pricePerUnit,
                token.decimals,
              )
            : null;
        const bestBidPrice = bestBid ? toSafeNumber(bestBid.pricePerUnit, token.decimals) : null;

        const recentActivity = [...marketListings, ...marketBids].filter(
          (order) =>
            Number(order.createdAt) >= activityCutoff || Number(order.updatedAt) >= activityCutoff,
        ).length;

        const lastActivityAt = [...marketListings, ...marketBids].reduce<number | null>(
          (latest, order) => {
            const candidate = Math.max(Number(order.createdAt), Number(order.updatedAt));
            if (latest === null || candidate > latest) return candidate;
            return latest;
          },
          null,
        );

        const rawUserPosition = balanceByTranche.get(fraction.trancheId.toString()) ?? 0n;
        const userPosition = toSafeNumber(rawUserPosition, FRACTION_DECIMALS);

        let state: TradeMarketState = "illiquid";
        if (executableListings.length > 0 || executableBids.length > 0) {
          state = "active";
        } else if (expiredListings.length > 0 || expiredBids.length > 0) {
          state = "expired";
        }

        output.push({
          id: buildMarketId(fraction, token),
          fractionName: fraction.name,
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
          quoteDemand,
          floorPrice,
          bestBidPrice,
          bestPrice: floorPrice,
          priceRangeLow: floorPrice,
          priceRangeHigh: highestAskPrice,
          activeListings: executableListings.length,
          expiredListings: expiredListings.length,
          activeBids: executableBids.length,
          expiredBids: expiredBids.length,
          recentActivity,
          lastActivityAt,
          chainTimestamp,
          userPosition,
          hasUserPosition: userPosition > 0,
          topListings: asksSortedByPrice.slice(0, 5).map((listing) => ({
            listingId: listing.listingId,
            seller: listing.seller,
            amount: toSafeNumber(listing.executableAmount, FRACTION_DECIMALS),
            amountRaw: listing.executableAmount,
            listedAmount: toSafeNumber(listing.amountRemaining, FRACTION_DECIMALS),
            listedAmountRaw: listing.amountRemaining,
            sellerBalanceRaw: listing.sellerBalance,
            isInventoryStale: listing.isInventoryStale,
            price: toSafeNumber(listing.pricePerUnit, token.decimals),
            priceRaw: listing.pricePerUnit,
            expiry: Number(listing.expiry),
          })),
          topBids: bidsSortedByPrice.slice(0, 5).map((bid) => ({
            bidId: bid.bidId,
            bidder: bid.bidder,
            amount: toSafeNumber(bid.executableAmount, FRACTION_DECIMALS),
            amountRaw: bid.executableAmount,
            requestedAmount: toSafeNumber(bid.amountRemaining, FRACTION_DECIMALS),
            requestedAmountRaw: bid.amountRemaining,
            bidderPaymentBalanceRaw: bid.bidderPaymentBalance,
            bidderPaymentAllowanceRaw: bid.bidderPaymentAllowance,
            isFundingStale: bid.isFundingStale,
            price: toSafeNumber(bid.pricePerUnit, token.decimals),
            priceRaw: bid.pricePerUnit,
            expiry: Number(bid.expiry),
          })),
        });
      }
    }

    return output;
  }, [
    allBids,
    allListings,
    balanceByTranche,
    bidderFundingByBidId,
    chainTimestamp,
    marketFractions,
    nowTimestamp,
    paymentTokens,
    sellerBalanceByListingId,
  ]);

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
    (bidPageContracts.length > 0 && bidReads.isPending) ||
    (fractionAddressContracts.length > 0 && fractionAddressReads.isPending) ||
    (fractionMetaContracts.length > 0 && fractionMetaReads.isPending) ||
    (paymentTokenMetadataContracts.length > 0 && paymentTokenReads.isPending) ||
    (balanceContracts.length > 0 && balanceReads.isPending) ||
    (sellerInventoryContracts.length > 0 && sellerInventoryReads.isPending) ||
    (bidFundingContracts.length > 0 && bidFundingReads.isPending);

  const isRefreshing =
    (canReadCore && bootstrapContracts.length > 0 && bootstrapReads.isFetching) ||
    (listingPageContracts.length > 0 && listingReads.isFetching) ||
    (bidPageContracts.length > 0 && bidReads.isFetching) ||
    (fractionAddressContracts.length > 0 && fractionAddressReads.isFetching) ||
    (fractionMetaContracts.length > 0 && fractionMetaReads.isFetching) ||
    (paymentTokenMetadataContracts.length > 0 && paymentTokenReads.isFetching) ||
    (balanceContracts.length > 0 && balanceReads.isFetching) ||
    (sellerInventoryContracts.length > 0 && sellerInventoryReads.isFetching) ||
    (bidFundingContracts.length > 0 && bidFundingReads.isFetching);

  const error =
    (bootstrapReads.error as Error | null) ||
    (listingReads.error as Error | null) ||
    (bidReads.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionMetaReads.error as Error | null) ||
    (paymentTokenReads.error as Error | null) ||
    (balanceReads.error as Error | null) ||
    (sellerInventoryReads.error as Error | null) ||
    (bidFundingReads.error as Error | null);

  function refreshMarkets() {
    void bootstrapReads.refetch();
    void listingReads.refetch();
    void bidReads.refetch();
    void fractionAddressReads.refetch();
    void fractionMetaReads.refetch();
    void paymentTokenReads.refetch();
    void balanceReads.refetch();
    void sellerInventoryReads.refetch();
    void bidFundingReads.refetch();
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
    allMarkets: markets,
    markets: filteredMarkets,
    totalCount: markets.length,
    paymentTokenOptions: paymentTokens,
    isLoading,
    isRefreshing,
    error,
    refreshMarkets,
  };
}
