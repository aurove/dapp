"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRightLeft, CheckCircle2, ShoppingCart, Wallet } from "lucide-react";
import { erc20Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@fractals/ui/components/ui/dialog";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { cn } from "@fractals/ui/lib/cn";
import type { TradeMarket } from "../types";
import { BidTradeAction, BuyTradeAction, SellTradeAction } from "./trade-market-action-forms";

type TradeMarketDialogProps = {
  market: TradeMarket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeExecuted?: () => void;
};

type TradeTab = "buy" | "sell" | "bid";

const ERC1155_APPROVAL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MARKETPLACE_ADMIN_ABI = [
  {
    inputs: [],
    name: "adminContract",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ADMIN_READ_ABI = [
  {
    inputs: [],
    name: "isPaused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function formatAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "No expiry";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

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

export function TradeMarketDialog({
  market,
  open,
  onOpenChange,
  onTradeExecuted,
}: TradeMarketDialogProps) {
  const [tab, setTab] = useState<TradeTab>("buy");
  const [buyListingId, setBuyListingId] = useState<string>("");
  const [sellBidId, setSellBidId] = useState<string>("");

  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = activeChain.id;
  const chainId = txFlowChainId ?? expectedChainId;
  const isCorrectNetwork = chainId === expectedChainId;

  const marketplace = getContractConfig(expectedChainId, "Marketplace");
  const paymentRouter = getContractConfig(expectedChainId, "PaymentRouter");
  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");

  const selectedListing = useMemo(
    () => market.topListings.find((entry) => entry.listingId.toString() === buyListingId) ?? null,
    [buyListingId, market.topListings],
  );
  const selectedBid = useMemo(
    () => market.topBids.find((entry) => entry.bidId.toString() === sellBidId) ?? null,
    [market.topBids, sellBidId],
  );

  useEffect(() => {
    if (!open) return;

    const firstListing = market.topListings[0];
    const firstBid = market.topBids[0];

    setTab("buy");
    setBuyListingId(firstListing?.listingId.toString() || "");
    setSellBidId(firstBid?.bidId.toString() || "");
  }, [market.id, market.topBids, market.topListings, open]);

  const adminContractRead = useReadContract({
    address: marketplace?.address,
    abi: MARKETPLACE_ADMIN_ABI,
    functionName: "adminContract",
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && marketplace?.address && marketplace.abi),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const adminContractAddress = adminContractRead.data as Address | undefined;

  const pausedRead = useReadContract({
    address: adminContractAddress,
    abi: ADMIN_READ_ABI,
    functionName: "isPaused",
    chainId: expectedChainId,
    query: {
      enabled: Boolean(
        open &&
        adminContractAddress &&
        adminContractAddress !== "0x0000000000000000000000000000000000000000",
      ),
      staleTime: 15_000,
      gcTime: 5 * 60_000,
    },
  });

  const isPaused = pausedRead.data === true;

  const paymentBalanceRead = useReadContract({
    address: market.paymentToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && userAddress),
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  });

  const paymentAllowanceRead = useReadContract({
    address: market.paymentToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: userAddress && paymentRouter?.address ? [userAddress, paymentRouter.address] : undefined,
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && userAddress && paymentRouter?.address),
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionBalanceRead = useReadContract({
    address: assetLedger?.address,
    abi: assetLedger?.abi,
    functionName: "balanceOf",
    args: userAddress && assetLedger?.address ? [userAddress, market.trancheId] : undefined,
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && userAddress && assetLedger?.address && assetLedger.abi),
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionApprovalRead = useReadContract({
    address: assetLedger?.address,
    abi: ERC1155_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args: userAddress && marketplace?.address ? [userAddress, marketplace.address] : undefined,
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && userAddress && assetLedger?.address && marketplace?.address),
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  });

  const paymentBalance = (paymentBalanceRead.data as bigint | undefined) ?? 0n;
  const paymentAllowance = (paymentAllowanceRead.data as bigint | undefined) ?? 0n;
  const fractionBalance = (fractionBalanceRead.data as bigint | undefined) ?? 0n;
  const fractionApproved = fractionApprovalRead.data === true;

  const readinessError = !isConnected
    ? "Connect a wallet to trade."
    : !isCorrectNetwork
      ? `Switch to ${activeChain.name}.`
      : isPaused
        ? "Marketplace is paused by admin."
        : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle className="text-2xl">{market.pair} Market</DialogTitle>
          <DialogDescription>
            Trade {market.fractionName} with {market.paymentTokenSymbol}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
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

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Orderbook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-5 pt-2">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Asks</p>
                  {market.topListings.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
                      No active listings.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {market.topListings.map((listing) => (
                        <button
                          key={listing.listingId.toString()}
                          type="button"
                          onClick={() => {
                            setBuyListingId(listing.listingId.toString());
                            setTab("buy");
                          }}
                          className={cn(
                            "grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition",
                            buyListingId === listing.listingId.toString()
                              ? "border-[#ccb98f]/60 bg-[#ccb98f]/10"
                              : "border-white/10 bg-white/[0.02] hover:border-white/20",
                          )}
                        >
                          <span className="text-[var(--muted)]">
                            #{listing.listingId.toString()}
                          </span>
                          <span className="font-medium text-[var(--foreground)]">
                            {formatTokenAmount(listing.amount)} {market.fractionSymbol}
                          </span>
                          <span className="font-medium text-[var(--foreground)]">
                            {formatTokenAmount(listing.price)} {market.paymentTokenSymbol}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Bids</p>
                  {market.topBids.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-[var(--muted)]">
                      No active bids.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {market.topBids.map((bid) => (
                        <button
                          key={bid.bidId.toString()}
                          type="button"
                          onClick={() => {
                            setSellBidId(bid.bidId.toString());
                            setTab("sell");
                          }}
                          className={cn(
                            "grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition",
                            sellBidId === bid.bidId.toString()
                              ? "border-sky-400/60 bg-sky-400/10"
                              : "border-white/10 bg-white/[0.02] hover:border-white/20",
                          )}
                        >
                          <span className="text-[var(--muted)]">#{bid.bidId.toString()}</span>
                          <span className="font-medium text-[var(--foreground)]">
                            {formatTokenAmount(bid.amount)} {market.fractionSymbol}
                          </span>
                          <span className="font-medium text-[var(--foreground)]">
                            {formatTokenAmount(bid.price)} {market.paymentTokenSymbol}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Readiness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-5 pt-2">
                <ReadinessItem ok={isConnected} label="Wallet connected" />
                <ReadinessItem ok={isCorrectNetwork} label={`Network: ${activeChain.name}`} />
                <ReadinessItem ok={!isPaused} label="Marketplace not paused" />
                <ReadinessItem
                  ok={paymentAllowance > 0n}
                  label={`Payment allowance set (${market.paymentTokenSymbol})`}
                />
                <ReadinessItem
                  ok={fractionApproved}
                  label="Fraction transfer approval for marketplace"
                />
                <ReadinessItem
                  ok={paymentBalance > 0n}
                  label={`Wallet holds ${market.paymentTokenSymbol}`}
                />
                <ReadinessItem ok={fractionBalance > 0n} label="Wallet holds market fractions" />

                {readinessError ? (
                  <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {readinessError}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Trade actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-5 pt-2">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={tab === "buy" ? "default" : "secondary"}
                    onClick={() => setTab("buy")}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Buy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tab === "sell" ? "default" : "secondary"}
                    onClick={() => setTab("sell")}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Sell
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tab === "bid" ? "default" : "secondary"}
                    onClick={() => setTab("bid")}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Place Bid
                  </Button>
                </div>

                {tab === "buy" ? (
                  <BuyTradeAction
                    key={selectedListing?.listingId.toString() ?? "buy-empty"}
                    market={market}
                    marketplaceAddress={marketplace?.address}
                    marketplaceAbi={marketplace?.abi}
                    paymentRouterAddress={paymentRouter?.address}
                    paymentBalance={paymentBalance}
                    paymentAllowance={paymentAllowance}
                    selectedListing={selectedListing}
                    isPaused={isPaused}
                    userAddress={userAddress}
                    onTradeExecuted={onTradeExecuted}
                  />
                ) : null}

                {tab === "sell" ? (
                  <SellTradeAction
                    key={selectedBid?.bidId.toString() ?? "sell-empty"}
                    market={market}
                    marketplaceAddress={marketplace?.address}
                    marketplaceAbi={marketplace?.abi}
                    fractionBalance={fractionBalance}
                    fractionApproved={fractionApproved}
                    selectedBid={selectedBid}
                    isPaused={isPaused}
                    userAddress={userAddress}
                    onTradeExecuted={onTradeExecuted}
                  />
                ) : null}

                {tab === "bid" ? (
                  <BidTradeAction
                    key={`${market.id}-${market.bestBidPrice ?? market.floorPrice ?? "0"}`}
                    market={market}
                    assetLedgerAddress={assetLedger?.address}
                    marketplaceAddress={marketplace?.address}
                    marketplaceAbi={marketplace?.abi}
                    paymentRouterAddress={paymentRouter?.address}
                    paymentBalance={paymentBalance}
                    paymentAllowance={paymentAllowance}
                    initialBidPrice={String(market.bestBidPrice ?? market.floorPrice ?? "")}
                    isPaused={isPaused}
                    onTradeExecuted={onTradeExecuted}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
