import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent } from "@fractals/ui/components/ui/card";
import { formatCompactUsd, formatPct, formatUsd } from "../helpers/formatters";
import type { TradeAsset } from "../types";

type TradeAssetCardProps = {
  asset: TradeAsset;
};

export function TradeAssetCard({ asset }: TradeAssetCardProps) {
  const hasChange = typeof asset.change24hPct === "number";
  const hasVolume = typeof asset.volume24hUsd === "number";

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-lg"
              aria-hidden="true"
            >
              {asset.thumbnail}
            </span>
            <div>
              <p className="text-sm text-[var(--muted)]">{asset.symbol}</p>
              <h3 className="text-base font-semibold text-[var(--foreground)]">{asset.name}</h3>
            </div>
          </div>

          {hasChange ? (
            <span
              className={
                asset.change24hPct >= 0
                  ? "rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200"
                  : "rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-200"
              }
            >
              {formatPct(asset.change24hPct)}
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Price</p>
          <p className="text-2xl font-semibold text-[var(--foreground)]">
            {formatUsd(asset.priceUsd)}
          </p>
          {hasVolume ? (
            <p className="text-sm text-[var(--muted)]">
              24h Volume: {formatCompactUsd(asset.volume24hUsd)}
            </p>
          ) : null}
        </div>

        <div className="mt-auto">
          <Button asChild size="sm" className="w-full">
            <Link href={`/app/trade?asset=${asset.symbol}`}>
              Trade
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
