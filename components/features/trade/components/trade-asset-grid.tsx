import type { TradeMarket } from "../types";
import { TradeAssetCard } from "./trade-asset-card";

type TradeAssetGridProps = {
  assets: TradeMarket[];
  getMarketHref: (marketId: string) => string;
};

export function TradeAssetGrid({ assets, getMarketHref }: TradeAssetGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => (
        <TradeAssetCard key={asset.id} asset={asset} marketHref={getMarketHref(asset.id)} />
      ))}
    </div>
  );
}
