export type TradeAssetCategory = "locked" | "liquid" | "yield";

export type TradeAsset = {
  id: string;
  name: string;
  symbol: string;
  thumbnail: string;
  priceUsd: number;
  volume24hUsd?: number;
  change24hPct?: number;
  category: TradeAssetCategory;
};

export type TradeSortOption =
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc"
  | "change_desc"
  | "change_asc";

export type TradeChangeFilter = "all" | "gainers" | "losers";
