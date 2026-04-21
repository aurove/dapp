import type { TradeAsset } from "../types";
import { TradeAssetRow } from "./trade-asset-row";

type TradeAssetTableProps = {
  assets: TradeAsset[];
};

export function TradeAssetTable({ assets }: TradeAssetTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] lg:block">
      <table className="min-w-full text-left">
        <thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Asset</th>
            <th className="px-4 py-3 font-medium">Price</th>
            <th className="px-4 py-3 font-medium">24h Volume</th>
            <th className="px-4 py-3 font-medium">24h Change</th>
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
