import Link from "next/link";
import { Button } from "@fractals/ui/components/ui/button";
import { formatCompactUsd, formatPct, formatUsd } from "../helpers/formatters";
import type { TradeAsset } from "../types";

type TradeAssetRowProps = {
  asset: TradeAsset;
};

export function TradeAssetRow({ asset }: TradeAssetRowProps) {
  return (
    <tr className="border-t border-[var(--line)] text-sm text-[var(--foreground)]">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-sm"
            aria-hidden="true"
          >
            {asset.thumbnail}
          </span>
          <div>
            <p className="font-medium">{asset.name}</p>
            <p className="text-xs text-[var(--muted)]">{asset.symbol}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">{formatUsd(asset.priceUsd)}</td>
      <td className="py-3 pr-4 text-[var(--muted)]">
        {typeof asset.volume24hUsd === "number" ? formatCompactUsd(asset.volume24hUsd) : "-"}
      </td>
      <td className="py-3 pr-4">
        {typeof asset.change24hPct === "number" ? (
          <span className={asset.change24hPct >= 0 ? "text-emerald-300" : "text-red-300"}>
            {formatPct(asset.change24hPct)}
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="py-3 text-right">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/app/trade?asset=${asset.symbol}`}>View</Link>
        </Button>
      </td>
    </tr>
  );
}
