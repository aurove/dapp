import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { Input } from "@fractals/ui/components/ui/input";
import { TRADE_CATEGORY_FILTERS, TRADE_CHANGE_FILTERS, TRADE_SORT_OPTIONS } from "../constants";
import type { TradeChangeFilter, TradeSortOption } from "../types";

type TradeListingToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  sortBy: TradeSortOption;
  onSortByChange: (value: TradeSortOption) => void;
  changeFilter: TradeChangeFilter;
  onChangeFilter: (value: TradeChangeFilter) => void;
  categoryFilter: string;
  onCategoryFilter: (value: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
};

export function TradeListingToolbar({
  query,
  onQueryChange,
  sortBy,
  onSortByChange,
  changeFilter,
  onChangeFilter,
  categoryFilter,
  onCategoryFilter,
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
            placeholder="Search assets by name or symbol"
            className="pl-9"
          />
        </label>

        <Button variant="secondary" onClick={onRefresh} disabled={isLoading}>
          <SlidersHorizontal className="h-4 w-4" />
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(event) => onCategoryFilter(event.target.value)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_CATEGORY_FILTERS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by 24h change"
          value={changeFilter}
          onChange={(event) => onChangeFilter(event.target.value as TradeChangeFilter)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_CHANGE_FILTERS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort assets"
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value as TradeSortOption)}
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
        >
          {TRADE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#0e141b] text-white">
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
