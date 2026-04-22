"use client";

import { ArrowUpDown, Landmark, Layers, ShoppingCart } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent } from "@fractals/ui/components/ui/card";
import { cn } from "@fractals/ui/lib/cn";
import type { TradeMarket } from "../types";
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

export function TradeAssetCard({ asset, onTradeExecuted }: TradeAssetCardProps) {
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
