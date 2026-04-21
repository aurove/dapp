"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent } from "@fractals/ui/components/ui/card";
import { formatCompactUsd } from "../helpers/formatters";
import type { TradeMarket } from "../types";

type TradeAssetCardProps = {
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

function stateBadgeClass(state: TradeMarket["state"]): string {
  if (state === "active") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (state === "expired") return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-white/20 bg-white/[0.04] text-[var(--muted)]";
}

export function TradeAssetCard({ asset }: TradeAssetCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const isLowLiquidity =
    asset.state === "active" && asset.totalListedSupply > 0 && asset.totalListedSupply < 10;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Market</p>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{asset.pair}</h3>
            <p className="text-xs text-[var(--muted)]">Tranche #{asset.trancheId.toString()}</p>
          </div>
          <span
            className={`rounded-md border px-2 py-1 text-xs font-medium ${stateBadgeClass(asset.state)}`}
          >
            {asset.state === "active"
              ? "Active"
              : asset.state === "expired"
                ? "Expired listings"
                : "Illiquid"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Floor / Best</p>
            <p className="font-semibold text-[var(--foreground)]">
              {asset.floorPrice === null
                ? "-"
                : `${formatCompactUsd(asset.floorPrice)} ${asset.paymentTokenSymbol}`}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Listed supply</p>
            <p className="font-semibold text-[var(--foreground)]">
              {asset.totalListedSupply.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Quote liquidity</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatCompactUsd(asset.quoteLiquidity)} {asset.paymentTokenSymbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Active listings</p>
            <p className="font-semibold text-[var(--foreground)]">{asset.activeListings}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {isLowLiquidity ? (
            <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">
              Low liquidity
            </span>
          ) : null}
          {asset.hasUserPosition ? (
            <span className="rounded-md border border-sky-400/40 bg-sky-400/10 px-2 py-1 text-sky-200">
              Your position: {asset.userPosition.toFixed(2)}
            </span>
          ) : null}
          {asset.recentActivity > 0 ? (
            <span className="rounded-md border border-white/20 bg-white/[0.04] px-2 py-1 text-[var(--muted)]">
              {asset.recentActivity} updates (24h)
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className="text-left text-xs text-[#ccb98f]"
          onClick={() => setShowPreview((current) => !current)}
        >
          {showPreview ? "Hide market preview" : "Show market preview"}
        </button>

        {showPreview ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
            <p className="text-[var(--muted)]">
              Price range:{" "}
              {asset.priceRangeLow === null || asset.priceRangeHigh === null
                ? "-"
                : `${formatCompactUsd(asset.priceRangeLow)} - ${formatCompactUsd(asset.priceRangeHigh)} ${asset.paymentTokenSymbol}`}
            </p>
            <p className="text-[var(--muted)]">Top depth:</p>
            {asset.topListings.length === 0 ? (
              <p className="text-[var(--muted)]">No active asks</p>
            ) : (
              <ul className="space-y-1">
                {asset.topListings.map((listing) => (
                  <li
                    key={listing.listingId.toString()}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>#{listing.listingId.toString()}</span>
                    <span>
                      {listing.amount.toFixed(2)} @ {formatCompactUsd(listing.price)}{" "}
                      {asset.paymentTokenSymbol}
                    </span>
                    <span className="text-[var(--muted)]">
                      exp {formatUnixDate(listing.expiry)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="mt-auto">
          <Button asChild size="sm" className="w-full">
            <Link href={`/app/trade?market=${encodeURIComponent(asset.pair)}`}>
              Open Market
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
