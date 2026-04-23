"use client";

import { decodeEventLog, type Address, type Hex } from "viem";
import type { TradeMarket } from "../types";

const LISTING_CREATED_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "listingId", type: "uint256" },
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: true, internalType: "address", name: "collection", type: "address" },
      { indexed: false, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "address", name: "paymentToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "pricePerUnit", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "expiry", type: "uint64" },
    ],
    name: "ListingCreated",
    type: "event",
  },
] as const;

const BID_PLACED_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "bidId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bidder", type: "address" },
      { indexed: true, internalType: "address", name: "collection", type: "address" },
      { indexed: false, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "address", name: "paymentToken", type: "address" },
      { indexed: false, internalType: "uint256", name: "pricePerUnit", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "escrowedPayment", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "expiry", type: "uint64" },
    ],
    name: "BidPlaced",
    type: "event",
  },
] as const;

type TxReceiptLike = {
  logs?: Array<{
    address: Address;
    data: Hex;
    topics: readonly Hex[];
  }>;
};

export type AutoMatchCandidate = {
  marketLabel: string;
  opposingOrderId: bigint;
  fillAmountRaw: bigint;
};

function normalizeAddress(value: string | Address) {
  return value.toLowerCase();
}

function findMarketByPair(
  markets: TradeMarket[],
  tokenId: bigint,
  paymentToken: Address,
): TradeMarket | null {
  return (
    markets.find(
      (market) =>
        market.trancheId === tokenId &&
        normalizeAddress(market.paymentToken) === normalizeAddress(paymentToken),
    ) ?? null
  );
}

function isDifferentAddress(left: string | undefined, right: string | Address) {
  if (!left) return true;
  return normalizeAddress(left) !== normalizeAddress(right);
}

export function extractCreatedListingId(receipt?: TxReceiptLike | null): bigint | null {
  if (!receipt) return null;
  for (const log of receipt.logs ?? []) {
    try {
      const decoded = decodeEventLog({
        abi: LISTING_CREATED_EVENT_ABI,
        data: log.data,
        topics: log.topics as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      const listingId = decoded.args.listingId;
      return typeof listingId === "bigint" ? listingId : BigInt(listingId);
    } catch {
      continue;
    }
  }
  return null;
}

export function extractCreatedBidId(receipt?: TxReceiptLike | null): bigint | null {
  if (!receipt) return null;
  for (const log of receipt.logs ?? []) {
    try {
      const decoded = decodeEventLog({
        abi: BID_PLACED_EVENT_ABI,
        data: log.data,
        topics: log.topics as [] | [`0x${string}`, ...`0x${string}`[]],
      });
      const bidId = decoded.args.bidId;
      return typeof bidId === "bigint" ? bidId : BigInt(bidId);
    } catch {
      continue;
    }
  }
  return null;
}

export function buildListingAutoMatchCandidate({
  markets,
  tokenId,
  paymentToken,
  askPriceRaw,
  listAmountRaw,
  userAddress,
}: {
  markets: TradeMarket[];
  tokenId: bigint;
  paymentToken: Address;
  askPriceRaw: bigint;
  listAmountRaw: bigint;
  userAddress?: Address;
}): AutoMatchCandidate | null {
  const market = findMarketByPair(markets, tokenId, paymentToken);
  if (!market) return null;

  const candidate = market.topBids.find(
    (bid) =>
      bid.priceRaw >= askPriceRaw &&
      bid.amountRaw > 0n &&
      isDifferentAddress(userAddress, bid.bidder),
  );

  if (!candidate) return null;

  return {
    marketLabel: market.pair,
    opposingOrderId: candidate.bidId,
    fillAmountRaw: listAmountRaw < candidate.amountRaw ? listAmountRaw : candidate.amountRaw,
  };
}

export function buildBidAutoMatchCandidate({
  markets,
  tokenId,
  paymentToken,
  bidPriceRaw,
  bidAmountRaw,
  userAddress,
}: {
  markets: TradeMarket[];
  tokenId: bigint;
  paymentToken: Address;
  bidPriceRaw: bigint;
  bidAmountRaw: bigint;
  userAddress?: Address;
}): AutoMatchCandidate | null {
  const market = findMarketByPair(markets, tokenId, paymentToken);
  if (!market) return null;

  const candidate = market.topListings.find(
    (listing) =>
      listing.priceRaw <= bidPriceRaw &&
      listing.amountRaw > 0n &&
      isDifferentAddress(userAddress, listing.seller),
  );

  if (!candidate) return null;

  return {
    marketLabel: market.pair,
    opposingOrderId: candidate.listingId,
    fillAmountRaw: bidAmountRaw < candidate.amountRaw ? bidAmountRaw : candidate.amountRaw,
  };
}
