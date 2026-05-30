"use client";

import { useMemo, useState } from "react";
import { erc1155Abi, erc20Abi, formatUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useChainTime } from "@/lib/web3/use-chain-time";
import {
  coreReadQueryOptions,
  detailReadQueryOptions,
  heavyReadQueryOptions,
  staticReadQueryOptions,
} from "@/lib/web3/read-query-options";
import { TRADE_MARKET_SORT_OPTIONS } from "../constants";
import { LISTINGS_PAGE_SIZE, parseActiveListingsReadResult } from "../data/contracts";
import type {
  TradeMarket,
  TradeMarketBase,
  TradeMarketSortOption,
  TradeMarketState,
} from "../types";
import { getBestAsk, getBestBid, sortAsksByBestPrice, sortBidsByBestPrice } from "../utils/pricing";
import { toAddress } from "../utils/read-parsers";
import { buildErc20MetadataContracts, parseErc20MetadataReads } from "../utils/token-metadata";

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

type UseMarketsParams = {
  paymentTokenOptionsOverride?: TradePaymentTokenInfo[] | null;
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
const MAX_MARKET_PAGES_PER_POLL = 12;
const MAX_ACTIVE_ORDER_VERIFICATION_READS = 120;

function inferFractionBase(symbol: string): TradeMarketBase {
  const normalized = symbol.toLowerCase();
  if (normalized.startsWith("fvebtc")) return "veBTC";
  if (normalized.startsWith("fvemezo")) return "veMEZO";
  return "veAsset";
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

export function useMarkets({ paymentTokenOptionsOverride = null }: UseMarketsParams = {}) {
  const txFlowChainId = useChainId();
  const { address: userAddress } = useAccount();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;
  const { chainTimestampNumber } = useChainTime();
  const chainTimestamp = chainTimestampNumber;

  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");
  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const paymentRouterAddress = paymentRouter?.address;

  const [query, setQuery] = useState("");
  const [fractionFilter, setFractionFilter] = useState<"all" | TradeMarketBase>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | string>("musd");
  const [stateFilter, setStateFilter] = useState<"all" | TradeMarketState>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<TradeMarketSortOption>(TRADE_MARKET_SORT_OPTIONS[0]!.value);
  const hasProvidedPaymentTokens =
    Array.isArray(paymentTokenOptionsOverride) && paymentTokenOptionsOverride.length > 0;
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
      ...coreReadQueryOptions,
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

    let pageCount = 0;
    for (let cursor = 0n; cursor < listingCount; cursor += LISTINGS_PAGE_SIZE) {
      if (pageCount >= MAX_MARKET_PAGES_PER_POLL) break;
      contracts.push({
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "getListings",
        args: [cursor, LISTINGS_PAGE_SIZE],
        chainId,
      });
      pageCount += 1;
    }

    return contracts;
  }, [canReadCore, chainId, listingCount, marketplace]);

  const listingReads = useReadContracts({
    allowFailure: true,
    contracts: listingPageContracts,
    query: {
      enabled: listingPageContracts.length > 0,
      ...detailReadQueryOptions,
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

    let pageCount = 0;
    for (let cursor = 0n; cursor < bidCount; cursor += LISTINGS_PAGE_SIZE) {
      if (pageCount >= MAX_MARKET_PAGES_PER_POLL) break;
      contracts.push({
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "getBids",
        args: [cursor, LISTINGS_PAGE_SIZE],
        chainId,
      });
      pageCount += 1;
    }

    return contracts;
  }, [bidCount, canReadCore, chainId, marketplace]);

  const bidReads = useReadContracts({
    allowFailure: true,
    contracts: bidPageContracts,
    query: {
      enabled: bidPageContracts.length > 0,
      ...detailReadQueryOptions,
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
      ...staticReadQueryOptions,
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
      ...staticReadQueryOptions,
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

  const marketFractions = fractions;

  const paymentTokenMetadataContracts = useMemo(
    () =>
      hasProvidedPaymentTokens
        ? []
        : buildErc20MetadataContracts({
            chainId,
            tokens: supportedTokens,
            skipToken: (token) => {
              const normalized = token.toLowerCase();
              return (
                normalized === btcAddress?.toLowerCase() ||
                normalized === mezoAddress?.toLowerCase() ||
                normalized === musdAddress?.toLowerCase()
              );
            },
          }),
    [btcAddress, chainId, hasProvidedPaymentTokens, mezoAddress, musdAddress, supportedTokens],
  );

  const paymentTokenReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenMetadataContracts,
    query: {
      enabled: !hasProvidedPaymentTokens && paymentTokenMetadataContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const paymentTokens = useMemo<TradePaymentTokenInfo[]>(() => {
    if (hasProvidedPaymentTokens) {
      return [...paymentTokenOptionsOverride!].sort((a, b) => {
        const aMusd = a.symbol.toLowerCase() === "musd";
        const bMusd = b.symbol.toLowerCase() === "musd";
        if (aMusd && !bMusd) return -1;
        if (!aMusd && bMusd) return 1;
        return a.symbol.localeCompare(b.symbol);
      });
    }

    const presetByToken: Record<string, { symbol: string; decimals: number }> = {};
    if (btcAddress) {
      presetByToken[btcAddress.toLowerCase()] = {
        symbol: "BTC",
        decimals: DEFAULT_DECIMALS,
      };
    }
    if (mezoAddress) {
      presetByToken[mezoAddress.toLowerCase()] = {
        symbol: "MEZO",
        decimals: DEFAULT_DECIMALS,
      };
    }
    if (musdAddress) {
      presetByToken[musdAddress.toLowerCase()] = {
        symbol: "MUSD",
        decimals: DEFAULT_DECIMALS,
      };
    }

    const items = parseErc20MetadataReads({
      tokens: supportedTokens,
      reads: paymentTokenReads.data,
      presetByToken,
      fallbackDecimals: DEFAULT_DECIMALS,
    });

    if (
      musdAddress &&
      !items.some((token) => token.address.toLowerCase() === musdAddress.toLowerCase())
    ) {
      items.unshift({ address: musdAddress, symbol: "MUSD", decimals: DEFAULT_DECIMALS });
    }

    return [...items].sort((a, b) => {
      const aMusd = a.symbol.toLowerCase() === "musd";
      const bMusd = b.symbol.toLowerCase() === "musd";
      if (aMusd && !bMusd) return -1;
      if (!aMusd && bMusd) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [
    btcAddress,
    hasProvidedPaymentTokens,
    mezoAddress,
    musdAddress,
    paymentTokenOptionsOverride,
    paymentTokenReads.data,
    supportedTokens,
  ]);

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
      ...detailReadQueryOptions,
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
    () =>
      allListings
        .filter((listing) => listing.isActive)
        .slice(0, MAX_ACTIVE_ORDER_VERIFICATION_READS),
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
      ...heavyReadQueryOptions,
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
      allBids
        .filter(
          (bid) => bid.isActive && bid.paymentToken.toLowerCase() !== btcAddress?.toLowerCase(),
        )
        .slice(0, MAX_ACTIVE_ORDER_VERIFICATION_READS),
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
      ...heavyReadQueryOptions,
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

    const activityCutoff = chainTimestamp === null ? null : chainTimestamp - 24 * 60 * 60;
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
            activityCutoff !== null &&
            (Number(order.createdAt) >= activityCutoff ||
              Number(order.updatedAt) >= activityCutoff),
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
          topListings: asksSortedByPrice.map((listing) => ({
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
          topBids: bidsSortedByPrice.map((bid) => ({
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
        (paymentFilter === "musd" && market.paymentTokenSymbol.toLowerCase() === "musd") ||
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
    (!hasProvidedPaymentTokens &&
      paymentTokenMetadataContracts.length > 0 &&
      paymentTokenReads.isPending) ||
    (balanceContracts.length > 0 && balanceReads.isPending) ||
    (sellerInventoryContracts.length > 0 && sellerInventoryReads.isPending) ||
    (bidFundingContracts.length > 0 && bidFundingReads.isPending);

  const isRefreshing =
    (canReadCore && bootstrapContracts.length > 0 && bootstrapReads.isFetching) ||
    (listingPageContracts.length > 0 && listingReads.isFetching) ||
    (bidPageContracts.length > 0 && bidReads.isFetching) ||
    (fractionAddressContracts.length > 0 && fractionAddressReads.isFetching) ||
    (fractionMetaContracts.length > 0 && fractionMetaReads.isFetching) ||
    (!hasProvidedPaymentTokens &&
      paymentTokenMetadataContracts.length > 0 &&
      paymentTokenReads.isFetching) ||
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
    if (!hasProvidedPaymentTokens) {
      void paymentTokenReads.refetch();
    }
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
    availableFractions: fractions.map((fraction) => ({
      trancheId: fraction.trancheId,
      fractionSymbol: fraction.symbol,
      fractionBase: fraction.base,
    })),
    paymentTokenOptions: paymentTokens,
    isLoading,
    isRefreshing,
    error,
    refreshMarkets,
  };
}
