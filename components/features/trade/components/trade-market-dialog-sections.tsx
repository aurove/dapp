"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, CheckCircle2, ShoppingCart, Wallet } from "lucide-react";
import { type Abi, type Address } from "viem";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { cn } from "@fractals/ui/lib/cn";
import { formatCompactRawTokenAmount, formatTokenAmount } from "../helpers/formatters";
import type { TradeMarket, TradeMarketBidPreview, TradeMarketListingPreview } from "../types";
import { BidTradeAction, BuyTradeAction, SellTradeAction } from "./trade-market-action-forms";

export type TradeTab = "buy" | "sell" | "bid";

type OrderbookViewMode = "all" | "asks" | "bids";

type MarketDepthCardProps = {
  market: TradeMarket;
};

type OrderbookCardProps = {
  market: TradeMarket;
  asksByBestPrice: TradeMarketListingPreview[];
  bidsByBestPrice: TradeMarketBidPreview[];
  bestAsk: TradeMarketListingPreview | null;
  bestBid: TradeMarketBidPreview | null;
  spreadRaw: bigint | null;
  midPriceRaw: bigint | null;
  onAskSelect: (listingId: string) => void;
  onBidSelect: (bidId: string) => void;
};

type ReadinessCardProps = {
  activeChainName: string;
  fractionApproved: boolean;
  fractionBalance: bigint;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isPaused: boolean;
  paymentAllowance: bigint;
  paymentBalance: bigint;
  paymentTokenSymbol: string;
  readinessError: string | null;
};

type TradeActionsCardProps = {
  activeTab: TradeTab;
  assetLedgerAddress?: Address;
  fractionApproved: boolean;
  fractionBalance: bigint;
  isPaused: boolean;
  market: TradeMarket;
  marketplaceAbi?: Abi;
  marketplaceAddress?: Address;
  onTabChange: (tab: TradeTab) => void;
  onTradeExecuted?: () => void;
  paymentAllowance: bigint;
  paymentBalance: bigint;
  paymentRouterAddress?: Address;
  selectedBid: TradeMarketBidPreview | null;
  selectedListing: TradeMarketListingPreview | null;
  userAddress?: Address;
};

function ReadinessItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
      ) : (
        <AlertCircle className="h-3.5 w-3.5 text-amber-300" aria-hidden />
      )}
      <span>{label}</span>
    </div>
  );
}

function OrderbookRowLayout({
  label,
  amount,
  price,
  className,
}: {
  label: React.ReactNode;
  amount: React.ReactNode;
  price: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(4.75rem,5.5rem)_minmax(5.5rem,6.5rem)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,8rem)_minmax(8rem,8rem)] sm:gap-4",
        className,
      )}
    >
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>

      <span className="min-w-0 justify-self-end text-right">{amount}</span>

      <span className="min-w-0 justify-self-start text-left">{price}</span>
    </div>
  );
}

function OrderbookOrderRow({
  id,
  isBest,
  amount,
  price,
  amountNote,
  paymentTokenSymbol,
  priceClassName,
  bestBadgeClassName,
}: {
  id: bigint;
  isBest: boolean;
  amount: number;
  price: number;
  amountNote?: string;
  paymentTokenSymbol: string;
  priceClassName: string;
  bestBadgeClassName: string;
}) {
  return (
    <OrderbookRowLayout
      label={
        <span className="flex min-w-0 items-center gap-1.5 text-[var(--muted)] sm:gap-2">
          #{id.toString()}
          {isBest ? (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] max-[420px]:hidden",
                bestBadgeClassName,
              )}
            >
              Best
            </span>
          ) : null}
        </span>
      }
      amount={
        <span className="flex min-w-0 flex-col items-end gap-0.5">
          <span className="max-w-full truncate font-medium text-[var(--foreground)]">
            {formatTokenAmount(amount)}
          </span>
          {amountNote ? <span className="text-[10px] text-amber-200">{amountNote}</span> : null}
        </span>
      }
      price={
        <span className={cn("block max-w-full truncate font-medium", priceClassName)}>
          {formatTokenAmount(price)} {paymentTokenSymbol}
        </span>
      }
    />
  );
}

export function MarketDepthCard({ market }: MarketDepthCardProps) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Market depth</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pb-5 pt-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--muted)]">Best ask</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            {market.floorPrice === null
              ? "-"
              : `${formatTokenAmount(market.floorPrice)} ${market.paymentTokenSymbol}`}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--muted)]">Best bid</p>
          <p className="text-lg font-semibold text-[var(--foreground)]">
            {market.bestBidPrice === null
              ? "-"
              : `${formatTokenAmount(market.bestBidPrice)} ${market.paymentTokenSymbol}`}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--muted)]">Ask depth</p>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {formatTokenAmount(market.quoteLiquidity)} {market.paymentTokenSymbol}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--muted)]">Bid depth</p>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {formatTokenAmount(market.quoteDemand)} {market.paymentTokenSymbol}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function OrderbookCard({
  market,
  asksByBestPrice,
  bidsByBestPrice,
  bestAsk,
  bestBid,
  spreadRaw,
  midPriceRaw,
  onAskSelect,
  onBidSelect,
}: OrderbookCardProps) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [viewMode, setViewMode] = useState<OrderbookViewMode>("all");

  const renderedAsks = useMemo(() => asksByBestPrice.slice().reverse(), [asksByBestPrice]);
  const visibleBids = useMemo(() => bidsByBestPrice, [bidsByBestPrice]);
  const showAsks = viewMode === "all" || viewMode === "asks";
  const showBids = viewMode === "all" || viewMode === "bids";
  const showSpread = viewMode === "all";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Orderbook</CardTitle>
          <div className="inline-flex rounded-lg border border-white/12 bg-white/[0.03] p-1">
            {(["all", "asks", "bids"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition",
                  viewMode === mode
                    ? "bg-white/12 text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/85",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 space-y-3 pb-5 pt-2">
        <div className="max-h-[32rem] space-y-3 overflow-y-auto overflow-x-hidden pr-1">
          {showAsks ? (
            <div className="space-y-2">
              {market.topListings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
                  No active asks. Sellers have not listed {market.fractionSymbol} for{" "}
                  {market.paymentTokenSymbol}.
                </p>
              ) : (
                <div className="min-w-0 space-y-2">
                  {renderedAsks.map((listing) => {
                    const isBestAsk = bestAsk?.listingId === listing.listingId;
                    const selectId = `ask-${listing.listingId.toString()}`;
                    const isSelected = selectedOrderId === selectId;

                    return (
                      <button
                        key={listing.listingId.toString()}
                        type="button"
                        onClick={() => {
                          onAskSelect(listing.listingId.toString());
                          setSelectedOrderId(selectId);
                        }}
                        className={cn(
                          "w-full min-w-0 rounded-lg border px-2 py-2 text-left text-xs transition sm:px-3",
                          isSelected
                            ? "border-rose-300/30 bg-rose-400/[0.08] hover:border-rose-300/40"
                            : "border-rose-300/10 bg-rose-400/[0.025] hover:border-rose-300/20",
                        )}
                      >
                        <OrderbookOrderRow
                          id={listing.listingId}
                          isBest={isBestAsk}
                          amount={listing.amount}
                          amountNote={
                            listing.isInventoryStale
                              ? `seller has ${formatTokenAmount(listing.amount)} of ${formatTokenAmount(
                                  listing.listedAmount,
                                )}`
                              : undefined
                          }
                          price={listing.price}
                          paymentTokenSymbol={market.paymentTokenSymbol}
                          priceClassName="text-rose-100"
                          bestBadgeClassName="border border-rose-300/30 text-rose-100"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
              <OrderbookRowLayout
                className="pl-2 pr-8 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)] sm:pl-3 sm:pr-11"
                label="Asks"
                amount="Amount"
                price="Price"
              />
            </div>
          ) : null}

          {showSpread ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                  Spread / Mid price
                </p>
                <p className="text-xs font-medium text-[var(--foreground)]">
                  {formatCompactRawTokenAmount(
                    midPriceRaw,
                    market.paymentTokenDecimals,
                    market.paymentTokenSymbol,
                  )}
                </p>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>
                  Spread{" "}
                  {formatCompactRawTokenAmount(
                    spreadRaw,
                    market.paymentTokenDecimals,
                    market.paymentTokenSymbol,
                  )}
                </span>
                <span>
                  {bestAsk && bestBid
                    ? "Best ask - best bid"
                    : bestAsk
                      ? "Waiting for bids"
                      : bestBid
                        ? "Waiting for asks"
                        : "No active orders"}
                </span>
              </div>
            </div>
          ) : null}

          {showBids ? (
            <div className="space-y-2">
              <OrderbookRowLayout
                className="pl-2 pr-8 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)] sm:pl-3 sm:pr-11"
                label="Bids"
                amount="Amount"
                price="Price"
              />

              {market.topBids.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
                  No active bids. Buyers have not placed demand for {market.fractionSymbol}.
                </p>
              ) : (
                <div className="min-w-0 space-y-2">
                  {visibleBids.map((bid) => {
                    const isBestBid = bestBid?.bidId === bid.bidId;
                    const selectId = `bid-${bid.bidId.toString()}`;
                    const isSelected = selectedOrderId === selectId;

                    return (
                      <button
                        key={bid.bidId.toString()}
                        type="button"
                        onClick={() => {
                          onBidSelect(bid.bidId.toString());
                          setSelectedOrderId(selectId);
                        }}
                        className={cn(
                          "w-full min-w-0 rounded-lg border px-2 py-2 text-left text-xs transition sm:px-3",
                          isSelected
                            ? "border-emerald-300/30 bg-emerald-400/[0.08] hover:border-emerald-300/40"
                            : "border-emerald-300/10 bg-emerald-400/[0.025] hover:border-emerald-300/20",
                        )}
                      >
                        <OrderbookOrderRow
                          id={bid.bidId}
                          isBest={isBestBid}
                          amount={bid.amount}
                          amountNote={
                            bid.isFundingStale
                              ? `funded ${formatTokenAmount(bid.amount)} of ${formatTokenAmount(
                                  bid.requestedAmount,
                                )}`
                              : undefined
                          }
                          price={bid.price}
                          paymentTokenSymbol={market.paymentTokenSymbol}
                          priceClassName="text-emerald-100"
                          bestBadgeClassName="border border-emerald-300/30 text-emerald-100"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReadinessCard({
  activeChainName,
  fractionApproved,
  fractionBalance,
  isConnected,
  isCorrectNetwork,
  isPaused,
  paymentAllowance,
  paymentBalance,
  paymentTokenSymbol,
  readinessError,
}: ReadinessCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Readiness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-5 pt-2">
        <ReadinessItem ok={isConnected} label="Wallet connected" />
        <ReadinessItem ok={isCorrectNetwork} label={`Network: ${activeChainName}`} />
        <ReadinessItem ok={!isPaused} label="Marketplace not paused" />
        <ReadinessItem
          ok={paymentAllowance > 0n}
          label={`Payment allowance set (${paymentTokenSymbol})`}
        />
        <ReadinessItem ok={fractionApproved} label="Fraction transfer approval for marketplace" />
        <ReadinessItem ok={paymentBalance > 0n} label={`Wallet holds ${paymentTokenSymbol}`} />
        <ReadinessItem ok={fractionBalance > 0n} label="Wallet holds market fractions" />

        {readinessError ? (
          <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {readinessError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TradeActionsCard({
  activeTab,
  assetLedgerAddress,
  fractionApproved,
  fractionBalance,
  isPaused,
  market,
  marketplaceAbi,
  marketplaceAddress,
  onTabChange,
  onTradeExecuted,
  paymentAllowance,
  paymentBalance,
  paymentRouterAddress,
  selectedBid,
  selectedListing,
  userAddress,
}: TradeActionsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trade actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-5 pt-2">
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "buy" ? "default" : "secondary"}
            onClick={() => onTabChange("buy")}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Buy
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "sell" ? "default" : "secondary"}
            onClick={() => onTabChange("sell")}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Sell
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "bid" ? "default" : "secondary"}
            onClick={() => onTabChange("bid")}
          >
            <Wallet className="h-3.5 w-3.5" /> Place Bid
          </Button>
        </div>

        {activeTab === "buy" ? (
          <BuyTradeAction
            key={selectedListing?.listingId.toString() ?? "buy-empty"}
            market={market}
            marketplaceAddress={marketplaceAddress}
            marketplaceAbi={marketplaceAbi}
            paymentRouterAddress={paymentRouterAddress}
            paymentBalance={paymentBalance}
            paymentAllowance={paymentAllowance}
            selectedListing={selectedListing}
            isPaused={isPaused}
            userAddress={userAddress}
            onTradeExecuted={onTradeExecuted}
          />
        ) : null}

        {activeTab === "sell" ? (
          <SellTradeAction
            key={selectedBid?.bidId.toString() ?? "sell-empty"}
            market={market}
            assetLedgerAddress={assetLedgerAddress}
            marketplaceAddress={marketplaceAddress}
            marketplaceAbi={marketplaceAbi}
            fractionBalance={fractionBalance}
            fractionApproved={fractionApproved}
            selectedBid={selectedBid}
            isPaused={isPaused}
            userAddress={userAddress}
            onTradeExecuted={onTradeExecuted}
          />
        ) : null}

        {activeTab === "bid" ? (
          <BidTradeAction
            key={`${market.id}-${market.bestBidPrice ?? market.floorPrice ?? "0"}`}
            market={market}
            assetLedgerAddress={assetLedgerAddress}
            marketplaceAddress={marketplaceAddress}
            marketplaceAbi={marketplaceAbi}
            paymentRouterAddress={paymentRouterAddress}
            paymentBalance={paymentBalance}
            paymentAllowance={paymentAllowance}
            initialBidPrice={String(market.bestBidPrice ?? market.floorPrice ?? "")}
            isPaused={isPaused}
            onTradeExecuted={onTradeExecuted}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
