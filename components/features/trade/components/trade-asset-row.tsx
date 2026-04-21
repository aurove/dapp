"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@fractals/ui/components/ui/button";
import { formatCompactUsd } from "../helpers/formatters";
import type { TradeMarket } from "../types";

type TradeAssetRowProps = {
  asset: TradeMarket;
};

function formatUnixDate(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "No expiry";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

export function TradeAssetRow({ asset }: TradeAssetRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--line)] text-sm text-[var(--foreground)]">
        <td className="py-3 pr-4">
          <p className="font-medium">{asset.pair}</p>
          <p className="text-xs text-[var(--muted)]">{asset.fractionSymbol}</p>
        </td>
        <td className="py-3 pr-4">{asset.activeListings}</td>
        <td className="py-3 pr-4">{asset.totalListedSupply.toFixed(2)}</td>
        <td className="py-3 pr-4">
          {asset.floorPrice === null
            ? "-"
            : `${formatCompactUsd(asset.floorPrice)} ${asset.paymentTokenSymbol}`}
        </td>
        <td className="py-3 pr-4">
          {formatCompactUsd(asset.quoteLiquidity)} {asset.paymentTokenSymbol}
        </td>
        <td className="py-3 pr-4">{asset.recentActivity}</td>
        <td className="py-3 pr-4 text-[var(--muted)] capitalize">{asset.state}</td>
        <td className="py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Hide" : "Preview"}
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/app/trade?market=${encodeURIComponent(asset.pair)}`}>Open</Link>
            </Button>
          </div>
        </td>
      </tr>

      {expanded ? (
        <tr className="border-t border-[var(--line)] bg-white/[0.02] text-xs text-[var(--muted)]">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid gap-2 md:grid-cols-3">
              <p>
                Price range:{" "}
                {asset.priceRangeLow === null || asset.priceRangeHigh === null
                  ? "-"
                  : `${formatCompactUsd(asset.priceRangeLow)} - ${formatCompactUsd(asset.priceRangeHigh)} ${asset.paymentTokenSymbol}`}
              </p>
              <p>User holdings: {asset.hasUserPosition ? asset.userPosition.toFixed(2) : "None"}</p>
              <p>Expired listings: {asset.expiredListings}</p>
            </div>
            <div className="mt-2 space-y-1">
              {asset.topListings.length === 0 ? (
                <p>No active order depth.</p>
              ) : (
                asset.topListings.map((listing) => (
                  <p key={listing.listingId.toString()}>
                    #{listing.listingId.toString()} | {listing.amount.toFixed(2)} @{" "}
                    {formatCompactUsd(listing.price)} {asset.paymentTokenSymbol} | exp{" "}
                    {formatUnixDate(listing.expiry)}
                  </p>
                ))
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
