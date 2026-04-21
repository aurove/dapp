import type { TradeMarketSortOption, TradeMarketState } from "./types";

export const TRADE_MARKET_SORT_OPTIONS: Array<{ label: string; value: TradeMarketSortOption }> = [
  { label: "Liquidity: High to Low", value: "liquidity_desc" },
  { label: "Liquidity: Low to High", value: "liquidity_asc" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Activity: High to Low", value: "activity_desc" },
  { label: "Activity: Low to High", value: "activity_asc" },
];

export const TRADE_MARKET_STATE_FILTERS: Array<{ label: string; value: "all" | TradeMarketState }> =
  [
    { label: "All markets", value: "all" },
    { label: "Active", value: "active" },
    { label: "Illiquid", value: "illiquid" },
    { label: "Expired", value: "expired" },
  ];

export const TRADE_FRACTION_FILTERS = [
  { label: "All fractions", value: "all" },
  { label: "fveBTC", value: "veBTC" },
  { label: "fveMEZO", value: "veMEZO" },
] as const;
