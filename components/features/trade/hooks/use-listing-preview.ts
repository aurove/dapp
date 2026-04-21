"use client";

import { useMemo } from "react";
import { formatUnits, parseUnits } from "viem";
import type { UserVeNft } from "./use-user-ve-nfts";

type UseListingPreviewParams = {
  selectedNft: UserVeNft | null;
  listAmount: string | number;
  unitPrice: string | number;
  expiryDays: string | number;
  paymentTokenSymbol: string | null;
  protocolFeeBps?: number | null;
};

type ListingPreview = {
  listAmountValue: number;
  unitPriceValue: number;
  totalValue: number;
  totalValueLabel: string;
  listedFractionsRaw: bigint;
  listedFractionsLabel: string;
  remainingFractionsRaw: bigint;
  remainingFractionsLabel: string;
  listedPercentage: number;
  expiryLabel: string;
  feeAmount: number;
  feeAmountLabel: string;
  sellerProceeds: number;
  sellerProceedsLabel: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number, maxFractionDigits = 6) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value);
}

function formatFractionAmount(raw: bigint): string {
  const parsed = Number.parseFloat(formatUnits(raw, 18));
  if (!Number.isFinite(parsed)) {
    return formatUnits(raw, 18);
  }
  return formatNumber(parsed, 6);
}

function toInputString(value: string | number): string {
  return typeof value === "string" ? value : String(value);
}

export function useListingPreview({
  selectedNft,
  listAmount,
  unitPrice,
  expiryDays,
  paymentTokenSymbol,
  protocolFeeBps,
}: UseListingPreviewParams): ListingPreview {
  return useMemo(() => {
    const normalizedListAmount = toInputString(listAmount);
    const normalizedUnitPrice = toInputString(unitPrice);
    const normalizedExpiryDays = toInputString(expiryDays);

    const listAmountValue = Number.parseFloat(normalizedListAmount.trim() || "0");
    const unitPriceValue = Number.parseFloat(normalizedUnitPrice.trim() || "0");
    const safeListAmount =
      Number.isFinite(listAmountValue) && listAmountValue > 0 ? listAmountValue : 0;
    const safeUnitPrice =
      Number.isFinite(unitPriceValue) && unitPriceValue > 0 ? unitPriceValue : 0;
    const totalValue = safeListAmount * safeUnitPrice;

    let listedFractionsRaw = 0n;
    try {
      listedFractionsRaw = parseUnits(safeListAmount.toString(), 18);
    } catch {
      listedFractionsRaw = 0n;
    }

    const capacityRaw = selectedNft?.availableFractionCapacityRaw ?? 0n;
    if (listedFractionsRaw > capacityRaw) {
      listedFractionsRaw = capacityRaw;
    }

    const remainingFractionsRaw =
      capacityRaw > listedFractionsRaw ? capacityRaw - listedFractionsRaw : 0n;
    const listedPercentage =
      capacityRaw > 0n
        ? clamp((Number(listedFractionsRaw) / Number(capacityRaw)) * 100, 0, 100)
        : 0;

    const expiryDaysValue = Number.parseInt(normalizedExpiryDays, 10);
    const expiryTimestamp =
      Number.isFinite(expiryDaysValue) && expiryDaysValue > 0
        ? Date.now() + expiryDaysValue * 24 * 60 * 60 * 1000
        : null;

    const feeBps =
      Number.isFinite(protocolFeeBps) && Number(protocolFeeBps) > 0 ? Number(protocolFeeBps) : 0;
    const feeAmount = (totalValue * feeBps) / 10_000;
    const sellerProceeds = totalValue - feeAmount;

    const tokenSymbol = paymentTokenSymbol ?? "token";

    return {
      listAmountValue: safeListAmount,
      unitPriceValue: safeUnitPrice,
      totalValue,
      totalValueLabel: `${formatNumber(totalValue, 6)} ${tokenSymbol}`,
      listedFractionsRaw,
      listedFractionsLabel: `${formatFractionAmount(listedFractionsRaw)} fractions`,
      remainingFractionsRaw,
      remainingFractionsLabel: `${formatFractionAmount(remainingFractionsRaw)} fractions`,
      listedPercentage,
      expiryLabel: expiryTimestamp
        ? new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
          }).format(new Date(expiryTimestamp))
        : "No expiry",
      feeAmount,
      feeAmountLabel:
        feeBps > 0
          ? `${formatNumber(feeAmount, 6)} ${tokenSymbol} (${(feeBps / 100).toFixed(2)}%)`
          : "No fee configured",
      sellerProceeds,
      sellerProceedsLabel: `${formatNumber(sellerProceeds, 6)} ${tokenSymbol}`,
    };
  }, [expiryDays, listAmount, paymentTokenSymbol, protocolFeeBps, selectedNft, unitPrice]);
}
