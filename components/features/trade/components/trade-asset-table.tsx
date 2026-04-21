import type { TradeMarket } from "../types";
import { TradeAssetRow } from "./trade-asset-row";

type TradeAssetTableProps = {
  assets: TradeMarket[];
};

export function TradeAssetTable({ assets }: TradeAssetTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
      <table className="min-w-full text-left">
        <thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Market</th>
            <th className="px-4 py-3 font-medium">Active Listings</th>
            <th className="px-4 py-3 font-medium">Listed Supply</th>
            <th className="px-4 py-3 font-medium">Floor Price</th>
            <th className="px-4 py-3 font-medium">Liquidity</th>
            <th className="px-4 py-3 font-medium">Activity (24h)</th>
            <th className="px-4 py-3 font-medium">State</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <TradeAssetRow key={asset.id} asset={asset} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
