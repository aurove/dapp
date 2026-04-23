"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@fractals/ui/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import { useMarkets } from "../hooks/use-markets";
import { useTradeBidding } from "../hooks/use-trade-bidding";
import { useTradeListing } from "../hooks/use-trade-listing";
import type { TradeAsset } from "../types";
import { TradeAssetGrid } from "./trade-asset-grid";
import { TradeCreateListingDialog } from "./trade-create-listing-dialog";
import { TradeEmptyState } from "./trade-empty-state";
import { TradeMarketDialog } from "./trade-market-dialog";
import { TradePlaceBidDialog } from "./trade-place-bid-dialog";
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
    createFractionListingSteps,
    canCreateListing,
    mapCreatedListingAsset,
    mapCreatedFractionListingAsset,
  } = useTradeListing();
  const { createBidSteps, canPlaceBid, bidWorkflowContracts } = useTradeBidding();

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
    allMarkets,
    markets,
    totalCount,
    paymentTokenOptions: marketPaymentTokens,
    isLoading,
    isRefreshing,
    error,
    refreshMarkets,
  } = useMarkets();

  const [lastCreated, setLastCreated] = useState<TradeAsset | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMarketId = searchParams.get("market");

  const selectedMarket = useMemo(
    () => allMarkets.find((market) => market.id === selectedMarketId) ?? null,
    [allMarkets, selectedMarketId],
  );

  const getMarketHref = useCallback(
    (marketId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("market", marketId);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  const closeMarketDialog = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("market");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!selectedMarketId || selectedMarket || isLoading || isRefreshing) return;
    closeMarketDialog();
  }, [closeMarketDialog, isLoading, isRefreshing, selectedMarket, selectedMarketId]);

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
            <div className="flex flex-wrap items-center gap-2">
              <TradeCreateListingDialog
                createVeListingSteps={createVeListingSteps}
                createFractionListingSteps={createFractionListingSteps}
                canCreateListing={canCreateListing}
                mapCreatedListingAsset={mapCreatedListingAsset}
                mapCreatedFractionListingAsset={mapCreatedFractionListingAsset}
                markets={markets}
                listingWorkflowContracts={listingWorkflowContracts}
                blockExplorerUrl={blockExplorerUrl}
                onCreated={setLastCreated}
                onListingCompleted={refreshMarkets}
                paymentTokenOptions={paymentTokenOptions}
                protocolFeeBps={protocolFeeBps}
                isLoadingPaymentTokens={isLoadingPaymentTokens}
                paymentTokenError={paymentTokenError}
                onRefreshPaymentTokens={refreshPaymentTokens}
              />
              <TradePlaceBidDialog
                markets={markets}
                paymentTokenOptions={paymentTokenOptions}
                createBidSteps={createBidSteps}
                canPlaceBid={canPlaceBid}
                bidWorkflowContracts={bidWorkflowContracts}
                onBidPlaced={refreshMarkets}
              />
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl">Fraction Markets</CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            Browse market pairs grouped by fraction / payment token. Open a market to inspect
            orderbook depth and execute supported on-chain actions.
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
        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-100">
            Failed to refresh markets: {error.message}
          </p>
        ) : null}
      </div>

      {isLoading ? <TradeLoadingState /> : null}

      {!isLoading && !hasMarkets ? <TradeEmptyState onClear={clearFilters} /> : null}

      {!isLoading && hasMarkets ? (
        <TradeAssetGrid assets={markets} getMarketHref={getMarketHref} />
      ) : null}

      {selectedMarket ? (
        <TradeMarketDialog
          market={selectedMarket}
          open={Boolean(selectedMarket)}
          onOpenChange={(next) => {
            if (!next) {
              closeMarketDialog();
            }
          }}
          onTradeExecuted={refreshMarkets}
        />
      ) : null}
    </section>
  );
}
