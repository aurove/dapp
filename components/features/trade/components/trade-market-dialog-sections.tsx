"use client";

import { AlertCircle, ArrowRightLeft, CheckCircle2, ShoppingCart, Wallet } from "lucide-react";
import { type Abi, type Address } from "viem";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { cn } from "@fractals/ui/lib/cn";
import { formatRawTokenAmount, formatTokenAmount } from "../helpers/formatters";
import type { TradeMarket, TradeMarketBidPreview, TradeMarketListingPreview } from "../types";
import { BidTradeAction, BuyTradeAction, SellTradeAction } from "./trade-market-action-forms";

export type TradeTab = "buy" | "sell" | "bid";

type MarketDepthCardProps = {
  market: TradeMarket;
};

type OrderbookCardProps = {
  market: TradeMarket;
  renderedAsks: TradeMarketListingPreview[];
  bidsByBestPrice: TradeMarketBidPreview[];
  bestAsk: TradeMarketListingPreview | null;
  bestBid: TradeMarketBidPreview | null;
  buyListingId: string;
  sellBidId: string;
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

export function MarketDepthCard({ market }: MarketDepthCardProps) {
  return (
    <Card>
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
          <p className="text-xs text-[var(--muted)]">Ask liquidity</p>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {formatTokenAmount(market.quoteLiquidity)} {market.paymentTokenSymbol}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--muted)]">Bid demand</p>
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
  renderedAsks,
  bidsByBestPrice,
  bestAsk,
  bestBid,
  buyListingId,
  sellBidId,
  spreadRaw,
  midPriceRaw,
  onAskSelect,
  onBidSelect,
}: OrderbookCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Orderbook</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pb-5 pt-2">
        <div className="space-y-2">
          {market.topListings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
              No active asks. Sellers have not listed {market.fractionSymbol} for{" "}
              {market.paymentTokenSymbol}.
            </p>
          ) : (
            <div className="space-y-2">
              {renderedAsks.map((listing) => {
                const isBestAsk = bestAsk?.listingId === listing.listingId;

                return (
                  <button
                    key={listing.listingId.toString()}
                    type="button"
                    onClick={() => onAskSelect(listing.listingId.toString())}
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg border px-3 py-2 text-left text-xs transition",
                      buyListingId === listing.listingId.toString()
                        ? "border-[#ccb98f]/60 bg-[#ccb98f]/10"
                        : isBestAsk
                          ? "border-rose-300/30 bg-rose-400/[0.08] hover:border-rose-300/40"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[var(--muted)]">
                      #{listing.listingId.toString()}
                      {isBestAsk ? (
                        <span className="rounded border border-rose-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-rose-100">
                          Best
                        </span>
                      ) : null}
                    </span>

                    <span className="text-right font-medium text-[var(--foreground)]">
                      {formatTokenAmount(listing.amount)} {market.fractionSymbol}
                    </span>

                    <span className="text-left font-medium text-rose-100">
                      {formatTokenAmount(listing.price)} {market.paymentTokenSymbol}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>Asks</span>
            <span className="text-right">Amount</span>
            <span className="text-left">Price</span>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
              Spread / Mid price
            </p>
            <p className="text-xs font-medium text-[var(--foreground)]">
              {formatRawTokenAmount(
                midPriceRaw,
                market.paymentTokenDecimals,
                market.paymentTokenSymbol,
              )}
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>
              Spread{" "}
              {formatRawTokenAmount(
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

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            <span>Bids</span>
            <span className="text-right">Amount</span>
            <span className="text-left">Price</span>
          </div>

          {market.topBids.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
              No active bids. Buyers have not placed demand for {market.fractionSymbol}.
            </p>
          ) : (
            <div className="space-y-2">
              {bidsByBestPrice.map((bid) => {
                const isBestBid = bestBid?.bidId === bid.bidId;

                return (
                  <button
                    key={bid.bidId.toString()}
                    type="button"
                    onClick={() => onBidSelect(bid.bidId.toString())}
                    className={cn(
                      "grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg border px-3 py-2 text-left text-xs transition",
                      sellBidId === bid.bidId.toString()
                        ? "border-sky-400/60 bg-sky-400/10"
                        : isBestBid
                          ? "border-emerald-300/30 bg-emerald-400/[0.08] hover:border-emerald-300/40"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[var(--muted)]">
                      #{bid.bidId.toString()}
                      {isBestBid ? (
                        <span className="rounded border border-emerald-300/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-100">
                          Best
                        </span>
                      ) : null}
                    </span>

                    <span className="text-right font-medium text-[var(--foreground)]">
                      {formatTokenAmount(bid.amount)} {market.fractionSymbol}
                    </span>

                    <span className="text-left font-medium text-emerald-100">
                      {formatTokenAmount(bid.price)} {market.paymentTokenSymbol}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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
