import type { TradeChangeFilter, TradeSortOption } from "./types";

export const TRADE_SORT_OPTIONS: Array<{ label: string; value: TradeSortOption }> = [
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Name: A to Z", value: "name_asc" },
  { label: "Name: Z to A", value: "name_desc" },
  { label: "24h Change: High to Low", value: "change_desc" },
  { label: "24h Change: Low to High", value: "change_asc" },
];

export const TRADE_CHANGE_FILTERS: Array<{ label: string; value: TradeChangeFilter }> = [
  { label: "All", value: "all" },
  { label: "Gainers", value: "gainers" },
  { label: "Losers", value: "losers" },
];

export const TRADE_CATEGORY_FILTERS = [
  { label: "All categories", value: "all" },
  { label: "Locked Exposure", value: "locked" },
  { label: "Liquid Exposure", value: "liquid" },
  { label: "Yield Route", value: "yield" },
] as const;
