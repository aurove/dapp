"use client";

import { Badge } from "@fractals/ui/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import { useTradeListing } from "../hooks/use-trade-listing";
import { TradeAssetGrid } from "./trade-asset-grid";
import { TradeAssetTable } from "./trade-asset-table";
import { TradeEmptyState } from "./trade-empty-state";
import { TradeListingToolbar } from "./trade-listing-toolbar";
import { TradeLoadingState } from "./trade-loading-state";

export function TradeAssetListing() {
  const {
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
    totalCount,
  } = useTradeListing();

  const hasAssets = filteredAssets.length > 0;

  function clearFilters() {
    setQuery("");
    setSortBy("price_desc");
    setChangeFilter("all");
    setCategoryFilter("all");
  }

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <Badge className="w-fit">Trade</Badge>
          <CardTitle className="text-2xl sm:text-3xl">Browse and trade available assets.</CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            Explore tradeable ve exposure assets with search, filters, and sortable market metrics.
          </p>
        </CardHeader>
      </Card>

      <TradeListingToolbar
        query={query}
        onQueryChange={setQuery}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        changeFilter={changeFilter}
        onChangeFilter={setChangeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilter={setCategoryFilter}
        isLoading={isLoading}
        onRefresh={refreshListing}
      />

      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <p>
          Showing{" "}
          <span className="font-semibold text-[var(--foreground)]">{filteredAssets.length}</span> of{" "}
          {totalCount} assets
        </p>
      </div>

      {isLoading ? <TradeLoadingState /> : null}

      {!isLoading && !hasAssets ? <TradeEmptyState onClear={clearFilters} /> : null}

      {!isLoading && hasAssets ? (
        <>
          <div className="lg:hidden">
            <TradeAssetGrid assets={filteredAssets} />
          </div>
          <TradeAssetTable assets={filteredAssets} />
        </>
      ) : null}
    </section>
  );
}
