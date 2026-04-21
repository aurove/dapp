"use client";

import { useMemo, useState } from "react";
import { TRADE_ASSETS_MOCK } from "../mock-data";
import type { TradeAsset, TradeChangeFilter, TradeSortOption } from "../types";

function applySort(items: TradeAsset[], sortBy: TradeSortOption): TradeAsset[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "price_desc":
        return b.priceUsd - a.priceUsd;
      case "price_asc":
        return a.priceUsd - b.priceUsd;
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "change_desc":
        return (b.change24hPct ?? 0) - (a.change24hPct ?? 0);
      case "change_asc":
        return (a.change24hPct ?? 0) - (b.change24hPct ?? 0);
      default:
        return 0;
    }
  });
}

export function useTradeListing() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<TradeSortOption>("price_desc");
  const [changeFilter, setChangeFilter] = useState<TradeChangeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const result = TRADE_ASSETS_MOCK.filter((asset) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.symbol.toLowerCase().includes(normalizedQuery);

      const matchesCategory = categoryFilter === "all" || asset.category === categoryFilter;

      const change = asset.change24hPct ?? 0;
      const matchesChange =
        changeFilter === "all" || (changeFilter === "gainers" ? change >= 0 : change < 0);

      return matchesQuery && matchesCategory && matchesChange;
    });

    return applySort(result, sortBy);
  }, [categoryFilter, changeFilter, query, sortBy]);

  function refreshListing() {
    setIsLoading(true);
    window.setTimeout(() => setIsLoading(false), 650);
  }

  return {
    query,
    setQuery,
    sortBy,
    setSortBy,
    changeFilter,
    setChangeFilter,
    categoryFilter,
    setCategoryFilter,
    isLoading,
    refreshListing,
    filteredAssets,
    totalCount: TRADE_ASSETS_MOCK.length,
  };
}
