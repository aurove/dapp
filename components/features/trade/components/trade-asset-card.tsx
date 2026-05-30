"use client";

import Link from "next/link";
import { ArrowUpDown, Landmark, Layers, ShoppingCart } from "lucide-react";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent } from "@fractals/ui/ui/card";
import { cn } from "@fractals/ui/lib/cn";
import { AddTokenToWalletButton } from "@/components/shared/add-token-to-wallet-button";
import { formatTokenAmount } from "../helpers/formatters";
import type { TradeMarket } from "../types";

type TradeAssetCardProps = {
  asset: TradeMarket;
  marketHref: string;
  onOpen?: () => void;
};

function stateBadgeClass(state: TradeMarket["state"]): string {
  if (state === "active") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (state === "expired") return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-white/20 bg-white/[0.04] text-[var(--muted)]";
}

function formatPrice(value: number | null, symbol: string): string {
  if (value === null) return "-";
  return `${formatTokenAmount(value, 4)} ${symbol}`;
}

export function TradeAssetCard({ asset, marketHref, onOpen }: TradeAssetCardProps) {
  const spread =
    asset.floorPrice !== null && asset.bestBidPrice !== null
      ? asset.floorPrice - asset.bestBidPrice
      : null;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Market pair</p>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{asset.pair}</h3>
            <p className="text-xs text-[var(--muted)]">{asset.fractionName} </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium",
                stateBadgeClass(asset.state),
              )}
            >
              {asset.state === "active"
                ? "Active"
                : asset.state === "expired"
                  ? "Only historical orders"
                  : "Illiquid"}
            </span>
            <AddTokenToWalletButton
              address={asset.fractionAddress}
              symbol={asset.fractionSymbol}
              className="shrink-0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Best ask</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatPrice(asset.floorPrice, asset.paymentTokenSymbol)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Best bid</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatPrice(asset.bestBidPrice, asset.paymentTokenSymbol)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Ask depth</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatTokenAmount(asset.quoteLiquidity, 4)} {asset.paymentTokenSymbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Bid depth</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatTokenAmount(asset.quoteDemand, 4)} {asset.paymentTokenSymbol}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Asks: {asset.activeListings}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
            <Landmark className="h-3.5 w-3.5" aria-hidden />
            Bids: {asset.activeBids}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
            Spread:{" "}
            {spread === null ? "-" : `${formatTokenAmount(spread, 4)} ${asset.paymentTokenSymbol}`}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            24h updates: {asset.recentActivity}
          </div>
        </div>

        {/* 
          TODO:
          Implement a consistent expiry/lock-end resolution strategy for AssetFractions.

          Requirements:
          - Support both:
            1. Fractions with deployed on-chain contracts (read expiry directly from contract state)
            2. Fractions not yet deployed (derive expiry from config, campaign params, or off-chain metadata)

          - Define a single source of truth for `lockEndsAt`:
            - Prefer on-chain data when available
            - Fallback to deterministic config/registry for undeployed assets

          - Ensure `lockLabel` and `formatLockEndsDate(lockEndsAt)` remain consistent across:
            - listing flows
            - bid flows
            - marketplace views

          - Handle edge cases:
            - undefined expiry (no lock)
            - expired locks
            - mismatched or stale metadata

          - Avoid per-component assumptions; centralise logic in a reusable helper/module.

          This block should only render once expiry resolution is deterministic.
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  <Clock3 className="h-4 w-4" aria-hidden />
                  <span>Lock ends</span>
                </div>
                <p className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                  {lockLabel}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-1 text-sm text-[var(--muted)]">
                <CalendarDays className="h-4 w-4" aria-hidden />
                <span>{formatLockEndsDate(lockEndsAt)}</span>
              </div>
            </div>
          </div> 
          */}

        <div className="mt-auto">
          <Button size="sm" className="w-full" asChild>
            <Link href={marketHref} onClick={onOpen}>
              Open market details
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
