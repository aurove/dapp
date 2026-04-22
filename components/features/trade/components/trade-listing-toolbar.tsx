import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Input } from "@fractals/ui/components/ui/input";
import {
  TRADE_FRACTION_FILTERS,
  TRADE_MARKET_SORT_OPTIONS,
  TRADE_MARKET_STATE_FILTERS,
} from "../constants";
import type { TradeMarketBase, TradeMarketSortOption, TradeMarketState } from "../types";

type PaymentTokenOption = {
  address: `0x${string}`;
  symbol: string;
};

type TradeListingToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  sortBy: TradeMarketSortOption;
  onSortByChange: (value: TradeMarketSortOption) => void;
  fractionFilter: "all" | TradeMarketBase;
  onFractionFilterChange: (value: "all" | TradeMarketBase) => void;
  paymentFilter: "all" | string;
  onPaymentFilterChange: (value: "all" | string) => void;
  stateFilter: "all" | TradeMarketState;
  onStateFilterChange: (value: "all" | TradeMarketState) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (value: boolean) => void;
  paymentTokenOptions: PaymentTokenOption[];
  isLoading: boolean;
  onRefresh: () => void;
};

export function TradeListingToolbar({
  query,
  onQueryChange,
  sortBy,
  onSortByChange,
  fractionFilter,
  onFractionFilterChange,
  paymentFilter,
  onPaymentFilterChange,
  stateFilter,
  onStateFilterChange,
  activeOnly,
  onActiveOnlyChange,
  paymentTokenOptions,
  isLoading,
  onRefresh,
}: TradeListingToolbarProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by pair, symbol, or tranche"
            className="pl-9"
          />
        </label>

        <Button variant="secondary" onClick={onRefresh} disabled={Boolean(isLoading)}>
          <SlidersHorizontal className="h-4 w-4" />
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select
          aria-label="Filter by fraction"
          value={fractionFilter}
          onChange={(event) =>
            onFractionFilterChange(event.target.value as "all" | TradeMarketBase)
          }
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_FRACTION_FILTERS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by payment token"
          value={paymentFilter}
          onChange={(event) => onPaymentFilterChange(event.target.value as "all" | string)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          <option value="all" className="bg-[#0e141b] text-white">
            All payment tokens
          </option>
          {paymentTokenOptions.map((option) => (
            <option
              key={option.address.toLowerCase()}
              value={option.address.toLowerCase()}
              className="bg-[#0e141b] text-white"
            >
              {option.symbol}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by market state"
          value={stateFilter}
          onChange={(event) => onStateFilterChange(event.target.value as "all" | TradeMarketState)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_MARKET_STATE_FILTERS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort markets"
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value as TradeMarketSortOption)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_MARKET_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(event) => onActiveOnlyChange(event.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-transparent"
        />
        Active markets only (asks or bids)
      </label>
    </div>
  );
}
