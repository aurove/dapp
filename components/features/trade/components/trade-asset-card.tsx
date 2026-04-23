"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CalendarDays, Clock3, Landmark, Layers, ShoppingCart } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent } from "@fractals/ui/components/ui/card";
import { cn } from "@fractals/ui/lib/cn";
import type { TradeMarket } from "../types";
import { decodeTrancheId } from "../utils/tranche";
import { TradeMarketDialog } from "./trade-market-dialog";

type TradeAssetCardProps = {
  asset: TradeMarket;
  onTradeExecuted?: () => void;
};

function formatAmount(value: number): string {
  if (Math.abs(value) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function stateBadgeClass(state: TradeMarket["state"]): string {
  if (state === "active") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  if (state === "expired") return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-white/20 bg-white/[0.04] text-[var(--muted)]";
}

function formatPrice(value: number | null, symbol: string): string {
  if (value === null) return "-";
  return `${formatAmount(value)} ${symbol}`;
}

function formatLockEndsDate(timestamp: number | null): string {
  if (!timestamp || timestamp <= 0) return "No expiry";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function formatLockEndsDuration(timestamp: number | null, nowTimestamp: number | null): string {
  if (!timestamp || timestamp <= 0) return "No expiry";
  if (!nowTimestamp || nowTimestamp <= 0) return "--";

  const remainingSeconds = Math.max(0, timestamp - nowTimestamp);
  if (remainingSeconds === 0) return "Expired";

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function TradeAssetCard({ asset, onTradeExecuted }: TradeAssetCardProps) {
  const spread =
    asset.floorPrice !== null && asset.bestBidPrice !== null
      ? asset.floorPrice - asset.bestBidPrice
      : null;
  const lockWeeks = decodeTrancheId(asset.trancheId)?.trancheNumber ?? null;
  const [lockEndsAt, setLockEndsAt] = useState<number | null>(null);

  useEffect(() => {
    setLockEndsAt(null);
  }, [asset.trancheId]);

  useEffect(() => {
    if (lockEndsAt !== null) return;
    if (!lockWeeks || lockWeeks <= 0 || asset.chainTimestamp === null) return;

    setLockEndsAt(asset.chainTimestamp + lockWeeks * 7 * 24 * 60 * 60);
  }, [asset.chainTimestamp, lockEndsAt, lockWeeks]);

  const lockLabel = useMemo(
    () => formatLockEndsDuration(lockEndsAt, asset.chainTimestamp),
    [asset.chainTimestamp, lockEndsAt],
  );

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Market pair</p>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{asset.pair}</h3>
            <p className="text-xs text-[var(--muted)]">{asset.fractionName} </p>
          </div>
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
            <p className="text-xs text-[var(--muted)]">Ask liquidity</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatAmount(asset.quoteLiquidity)} {asset.paymentTokenSymbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Bid demand</p>
            <p className="font-semibold text-[var(--foreground)]">
              {formatAmount(asset.quoteDemand)} {asset.paymentTokenSymbol}
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
            Spread: {spread === null ? "-" : `${formatAmount(spread)} ${asset.paymentTokenSymbol}`}
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
          <TradeMarketDialog
            market={asset}
            onTradeExecuted={onTradeExecuted}
            trigger={
              <Button size="sm" className="w-full">
                Open market details
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
