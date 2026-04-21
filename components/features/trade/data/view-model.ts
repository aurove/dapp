"use client";

import { formatUnits, type Address } from "viem";
import type { TradeAsset } from "../types";

type ListingViewModelInput = {
  listingId: bigint;
  tokenId: bigint;
  amountRemaining: bigint;
  paymentToken: Address;
  pricePerUnit: bigint;
  totalPriceRemaining?: bigint;
};

type BuildTradeAssetViewModelsParams = {
  listings: ListingViewModelInput[];
  tokenUriMap: Record<string, string>;
  paymentTokenDecimalsMap: Record<string, number>;
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
}: BuildTradeAssetViewModelsParams): TradeAsset[] {
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
}
