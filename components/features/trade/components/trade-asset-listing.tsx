"use client";

import { useState } from "react";
import { Badge } from "@fractals/ui/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import { useMarkets } from "../hooks/use-markets";
import { useTradeListing } from "../hooks/use-trade-listing";
import type { TradeAsset } from "../types";
import { TradeAssetGrid } from "./trade-asset-grid";
import { TradeCreateListingDialog } from "./trade-create-listing-dialog";
import { TradeEmptyState } from "./trade-empty-state";
import { TradeListingToolbar } from "./trade-listing-toolbar";
import { TradeLoadingState } from "./trade-loading-state";

export function TradeAssetListing() {
  const {
    listingWorkflowContracts,
    blockExplorerUrl,
    paymentTokenOptions,
    protocolFeeBps,
    isLoadingPaymentTokens,
    paymentTokenError,
    refreshPaymentTokens,
    createVeListingSteps,
    canCreateListing,
    mapCreatedListingAsset,
  } = useTradeListing();

  const {
    query,
    setQuery,
    fractionFilter,
    setFractionFilter,
    paymentFilter,
    setPaymentFilter,
    stateFilter,
    setStateFilter,
    activeOnly,
    setActiveOnly,
    sortBy,
    setSortBy,
    markets,
    totalCount,
    paymentTokenOptions: marketPaymentTokens,
    isLoading,
    isRefreshing,
    refreshMarkets,
  } = useMarkets();

  const [lastCreated, setLastCreated] = useState<TradeAsset | null>(null);

  const hasMarkets = markets.length > 0;

  function clearFilters() {
    setQuery("");
    setFractionFilter("all");
    setPaymentFilter("all");
    setStateFilter("all");
    setSortBy("liquidity_desc");
    setActiveOnly(false);
  }

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge className="w-fit">Trade Markets</Badge>
            <TradeCreateListingDialog
              createVeListingSteps={createVeListingSteps}
              canCreateListing={canCreateListing}
              mapCreatedListingAsset={mapCreatedListingAsset}
              listingWorkflowContracts={listingWorkflowContracts}
              blockExplorerUrl={blockExplorerUrl}
              onCreated={setLastCreated}
              paymentTokenOptions={paymentTokenOptions}
              protocolFeeBps={protocolFeeBps}
              isLoadingPaymentTokens={isLoadingPaymentTokens}
              paymentTokenError={paymentTokenError}
              onRefreshPaymentTokens={refreshPaymentTokens}
            />
          </div>
          <CardTitle className="text-2xl sm:text-3xl">
            Markets Overview: fraction symbols vs payment tokens
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            Scan on-chain market pairs by liquidity, floor price, listing depth, and recent
            activity.
          </p>
          {lastCreated ? (
            <p className="max-w-3xl text-sm text-emerald-300">
              Published listing: {lastCreated.symbol} at ${lastCreated.priceUsd.toFixed(3)}.
            </p>
          ) : null}
        </CardHeader>
      </Card>

      <TradeListingToolbar
        query={query}
        onQueryChange={setQuery}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        fractionFilter={fractionFilter}
        onFractionFilterChange={setFractionFilter}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        stateFilter={stateFilter}
        onStateFilterChange={setStateFilter}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
        paymentTokenOptions={marketPaymentTokens}
        isLoading={isLoading || isRefreshing}
        onRefresh={refreshMarkets}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
        <p>
          Showing <span className="font-semibold text-[var(--foreground)]">{markets.length}</span>{" "}
          of {totalCount} markets
        </p>
      </div>

      {isLoading ? <TradeLoadingState /> : null}

      {!isLoading && !hasMarkets ? <TradeEmptyState onClear={clearFilters} /> : null}

      {!isLoading && hasMarkets ? <TradeAssetGrid assets={markets} /> : null}
    </section>
  );
}
