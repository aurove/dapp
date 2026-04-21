"use client";

import { formatUnits, type Address } from "viem";
import type { TradeAsset } from "../types";

type ListingViewModelInput = {
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

type BuildTradeAssetViewModelsParams = {
  listings: ListingViewModelInput[];
  tokenUriMap: Record<string, string>;
  paymentTokenDecimalsMap: Record<string, number>;
  paymentTokenSymbolsMap: Record<string, string>;
};

function inferVeLabelFromUri(uri: string | undefined): string {
  if (!uri) return "veAsset";
  const normalized = uri.toLowerCase();
  if (normalized.includes("vebtc")) return "veBTC";
  if (normalized.includes("vemezo")) return "veMEZO";
  return "veAsset";
}

export function buildTradeAssetViewModels({
  listings,
  tokenUriMap,
  paymentTokenDecimalsMap,
  paymentTokenSymbolsMap,
}: BuildTradeAssetViewModelsParams): TradeAsset[] {
  return listings.map((listing) => {
    const listingId = Number(listing.listingId);
    const tokenId = Number(listing.tokenId);
    const paymentTokenKey = listing.paymentToken.toLowerCase();
    const paymentDecimals = paymentTokenDecimalsMap[paymentTokenKey] ?? 18;
    const paymentSymbol = paymentTokenSymbolsMap[paymentTokenKey] ?? "TOKEN";
    const unitPrice = Number(formatUnits(listing.pricePerUnit, paymentDecimals));
    const amount = Number(formatUnits(listing.amountRemaining, 18));
    const uri = tokenUriMap[listing.tokenId.toString()];
    const veLabel = inferVeLabelFromUri(uri);
    const totalValue = Number(formatUnits(listing.totalPriceRemaining, paymentDecimals));

    return {
      id: `listing-${listingId}`,
      name: `${veLabel} Fraction #${tokenId}`,
      symbol: `${veLabel}-${tokenId}`,
      thumbnail: veLabel === "veBTC" ? "🟧" : veLabel === "veMEZO" ? "🟩" : "🧩",
      priceUsd: unitPrice,
      volume24hUsd: totalValue,
      change24hPct: undefined,
      category: "locked",
      listingId: listing.listingId,
      paymentToken: listing.paymentToken,
      paymentTokenSymbol: paymentSymbol,
      amountRemaining: amount,
      expiry: Number(listing.expiry),
      seller: listing.seller,
    } satisfies TradeAsset;
  });
}
