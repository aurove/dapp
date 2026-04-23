"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Button } from "@fractals/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@fractals/ui/components/ui/dialog";
import { Input } from "@fractals/ui/components/ui/input";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { cn } from "@fractals/ui/lib/cn";
import type { TradeMarket } from "../types";
import { quoteRequiredPaymentRaw } from "../utils/pricing";

type TradeMarketDialogProps = {
  market: TradeMarket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeExecuted?: () => void;
};

type TradeTab = "buy" | "sell" | "bid";

type TxStage = "idle" | "pending" | "success" | "error";

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

function parseTradeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const normalized = text.toLowerCase();

  if (normalized.includes("user rejected") || normalized.includes("user denied")) {
    return "Transaction rejected in wallet.";
  }
  if (normalized.includes("insufficientpaymentallowance")) {
    return "Allowance too low for this trade amount.";
  }
  if (normalized.includes("insufficientpaymentbalance")) {
    return "Wallet balance is below required quote amount.";
  }
  if (normalized.includes("insufficientfractionbalance")) {
    return "Fraction balance is below requested sell amount.";
  }
  if (normalized.includes("fractiontransfernotapproved")) {
    return "Approve fraction transfers to marketplace before selling to a bid.";
  }
  if (normalized.includes("cannotbuyownlisting")) {
    return "Cannot buy your own listing.";
  }
  if (normalized.includes("cannotselltoownbid")) {
    return "Cannot sell into your own bid.";
  }
  if (normalized.includes("paused")) {
    return "Marketplace is paused by admin.";
  }
  if (normalized.includes("listingnotactive") || normalized.includes("bidnotactive")) {
    return "Selected order is no longer active. Refresh market data.";
  }

  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function parseAmountRaw(value: string, decimals: number): bigint | null {
  try {
    const parsed = parseUnits(value.trim(), decimals);
    if (parsed <= 0n) return null;
    return parsed;
  } catch {
    return null;
  }
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
  const [buyAmount, setBuyAmount] = useState("1");
  const [sellAmount, setSellAmount] = useState("1");
  const [bidAmount, setBidAmount] = useState("1");
  const [bidPrice, setBidPrice] = useState("");
  const [bidExpiryMode, setBidExpiryMode] = useState<"timed" | "none">("timed");
  const [bidExpiryDays, setBidExpiryDays] = useState("7");
  const [txStage, setTxStage] = useState<TxStage>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = activeChain.id;
  const chainId = txFlowChainId ?? expectedChainId;
  const isCorrectNetwork = chainId === expectedChainId;
  const blockExplorerUrl = activeChain.blockExplorers?.default?.url ?? null;

  const marketplace = getContractConfig(expectedChainId, "Marketplace");
  const paymentRouter = getContractConfig(expectedChainId, "PaymentRouter");
  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");

  const { writeContractAsync } = useWriteContract();
  const txReceipt = useWaitForTransactionReceipt({
    chainId: expectedChainId,
    hash: txHash ?? undefined,
    query: { enabled: Boolean(txHash) },
  });

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
    setTxError(null);
    setTxHash(null);
    setTxStage("idle");
    setBuyListingId(firstListing?.listingId.toString() || "");
    setSellBidId(firstBid?.bidId.toString() || "");
    setBidPrice(String(market.bestBidPrice ?? market.floorPrice ?? ""));
  }, [market.bestBidPrice, market.floorPrice, market.id, market.topBids, market.topListings, open]);

  useEffect(() => {
    if (txReceipt.isSuccess) {
      setTxStage("success");
      onTradeExecuted?.();
    }
  }, [onTradeExecuted, txReceipt.isSuccess]);

  useEffect(() => {
    if (txReceipt.isError) {
      setTxStage("error");
      setTxError(parseTradeError(txReceipt.error));
    }
  }, [txReceipt.error, txReceipt.isError]);

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

  const buyAmountRaw = useMemo(() => parseAmountRaw(buyAmount, 18), [buyAmount]);
  const sellAmountRaw = useMemo(() => parseAmountRaw(sellAmount, 18), [sellAmount]);
  const bidAmountRaw = useMemo(() => parseAmountRaw(bidAmount, 18), [bidAmount]);
  const bidPriceRaw = useMemo(
    () => parseAmountRaw(bidPrice, market.paymentTokenDecimals),
    [bidPrice, market.paymentTokenDecimals],
  );

  const buyRequiredPayment = useMemo(
    () =>
      selectedListing && buyAmountRaw
        ? quoteRequiredPaymentRaw(buyAmountRaw, selectedListing.priceRaw)
        : null,
    [buyAmountRaw, selectedListing],
  );
  const bidRequiredPayment = useMemo(
    () => quoteRequiredPaymentRaw(bidAmountRaw, bidPriceRaw),
    [bidAmountRaw, bidPriceRaw],
  );

  const canBuy =
    Boolean(selectedListing) &&
    Boolean(buyAmountRaw) &&
    Boolean(buyRequiredPayment) &&
    !isPaused &&
    selectedListing!.seller.toLowerCase() !== userAddress?.toLowerCase() &&
    buyAmountRaw! <= selectedListing!.amountRaw &&
    paymentBalance >= buyRequiredPayment! &&
    paymentAllowance >= buyRequiredPayment!;

  const canSell =
    Boolean(selectedBid) &&
    Boolean(sellAmountRaw) &&
    !isPaused &&
    selectedBid!.bidder.toLowerCase() !== userAddress?.toLowerCase() &&
    sellAmountRaw! <= selectedBid!.amountRaw &&
    fractionBalance >= sellAmountRaw! &&
    fractionApproved;

  const parsedBidDays = Number.parseInt(bidExpiryDays, 10);
  const bidExpiryValid =
    bidExpiryMode === "none" || (Number.isFinite(parsedBidDays) && parsedBidDays >= 1);

  const canPlaceBid =
    Boolean(bidAmountRaw) &&
    Boolean(bidPriceRaw) &&
    Boolean(bidRequiredPayment) &&
    !isPaused &&
    bidExpiryValid &&
    paymentBalance >= bidRequiredPayment! &&
    paymentAllowance >= bidRequiredPayment!;

  const anyPending =
    txStage === "pending" || (txReceipt.data && txReceipt.isPending) || txReceipt.isLoading;

  async function submitBuy() {
    if (!marketplace?.address || !marketplace.abi || !selectedListing || !buyAmountRaw || !canBuy)
      return;

    try {
      setTxError(null);
      setTxStage("pending");
      const hash = await writeContractAsync({
        chainId: expectedChainId,
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "buyFromListing",
        args: [selectedListing.listingId, buyAmountRaw],
      });
      setTxHash(hash);
    } catch (error) {
      setTxError(parseTradeError(error));
      setTxStage("error");
    }
  }

  async function submitSell() {
    if (!marketplace?.address || !marketplace.abi || !selectedBid || !sellAmountRaw || !canSell)
      return;

    try {
      setTxError(null);
      setTxStage("pending");
      const hash = await writeContractAsync({
        chainId: expectedChainId,
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "sellToBid",
        args: [selectedBid.bidId, sellAmountRaw],
      });
      setTxHash(hash);
    } catch (error) {
      setTxError(parseTradeError(error));
      setTxStage("error");
    }
  }

  async function submitBid() {
    if (
      !marketplace?.address ||
      !marketplace.abi ||
      !assetLedger?.address ||
      !bidAmountRaw ||
      !bidPriceRaw ||
      !canPlaceBid
    ) {
      return;
    }

    const expiry =
      bidExpiryMode === "none"
        ? 0n
        : BigInt(Math.floor(Date.now() / 1000) + Math.max(1, parsedBidDays) * 24 * 60 * 60);

    try {
      setTxError(null);
      setTxStage("pending");
      const hash = await writeContractAsync({
        chainId: expectedChainId,
        address: marketplace.address,
        abi: marketplace.abi,
        functionName: "placeBidWithExpiry",
        args: [
          assetLedger.address,
          market.trancheId,
          bidAmountRaw,
          market.paymentToken,
          bidPriceRaw,
          expiry,
        ],
      });
      setTxHash(hash);
    } catch (error) {
      setTxError(parseTradeError(error));
      setTxStage("error");
    }
  }

  function resetTransactionState() {
    setTxError(null);
    setTxHash(null);
    setTxStage("idle");
  }

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
        if (!next) resetTransactionState();
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
                  <div className="space-y-3">
                    <label className="block text-xs text-[var(--muted)]">
                      Amount to buy ({market.fractionSymbol})
                      <Input
                        value={buyAmount}
                        onChange={(event) => setBuyAmount(event.target.value)}
                      />
                    </label>
                    {selectedListing ? (
                      <p className="text-xs text-[var(--muted)]">
                        Listing #{selectedListing.listingId.toString()} by{" "}
                        {formatAddress(selectedListing.seller)} | max{" "}
                        {formatTokenAmount(selectedListing.amount)} | exp{" "}
                        {formatDate(selectedListing.expiry)}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-200">Select an ask from the orderbook.</p>
                    )}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={anyPending || !canBuy || Boolean(readinessError)}
                      onClick={submitBuy}
                    >
                      {anyPending && tab === "buy" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Submitting
                        </>
                      ) : (
                        "Buy from listing"
                      )}
                    </Button>
                  </div>
                ) : null}

                {tab === "sell" ? (
                  <div className="space-y-3">
                    <label className="block text-xs text-[var(--muted)]">
                      Amount to sell ({market.fractionSymbol})
                      <Input
                        value={sellAmount}
                        onChange={(event) => setSellAmount(event.target.value)}
                      />
                    </label>
                    {selectedBid ? (
                      <p className="text-xs text-[var(--muted)]">
                        Bid #{selectedBid.bidId.toString()} by {formatAddress(selectedBid.bidder)} |
                        max {formatTokenAmount(selectedBid.amount)} | exp{" "}
                        {formatDate(selectedBid.expiry)}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-200">Select a bid from the orderbook.</p>
                    )}
                    <Button
                      type="button"
                      className="w-full"
                      disabled={anyPending || !canSell || Boolean(readinessError)}
                      onClick={submitSell}
                    >
                      {anyPending && tab === "sell" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Submitting
                        </>
                      ) : (
                        "Sell into bid"
                      )}
                    </Button>
                  </div>
                ) : null}

                {tab === "bid" ? (
                  <div className="space-y-3">
                    <label className="block text-xs text-[var(--muted)]">
                      Bid amount ({market.fractionSymbol})
                      <Input
                        value={bidAmount}
                        onChange={(event) => setBidAmount(event.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-[var(--muted)]">
                      Bid price per fraction ({market.paymentTokenSymbol})
                      <Input
                        value={bidPrice}
                        onChange={(event) => setBidPrice(event.target.value)}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        aria-label="Bid expiry mode"
                        className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm"
                        value={bidExpiryMode}
                        onChange={(event) =>
                          setBidExpiryMode(event.target.value as "timed" | "none")
                        }
                      >
                        <option value="timed">Timed expiry</option>
                        <option value="none">No expiry</option>
                      </select>
                      <Input
                        value={bidExpiryDays}
                        disabled={bidExpiryMode === "none"}
                        onChange={(event) => setBidExpiryDays(event.target.value)}
                        placeholder="Days"
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={anyPending || !canPlaceBid || Boolean(readinessError)}
                      onClick={submitBid}
                    >
                      {anyPending && tab === "bid" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Submitting
                        </>
                      ) : (
                        "Place bid"
                      )}
                    </Button>
                    <p className="text-xs text-[var(--muted)]">
                      Bids are non-custodial in this contract: funds remain in your wallet until
                      filled.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Transaction status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-5 pt-2 text-xs">
                {txStage === "idle" ? (
                  <div className="flex items-center gap-2 text-[var(--muted)]">
                    <CircleDashed className="h-3.5 w-3.5" />
                    Ready to submit.
                  </div>
                ) : null}
                {txStage === "pending" ? (
                  <div className="flex items-center gap-2 text-sky-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Waiting for confirmation.
                  </div>
                ) : null}
                {txStage === "success" ? (
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmed on-chain.
                  </div>
                ) : null}
                {txStage === "error" ? (
                  <div className="space-y-1 text-red-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Transaction failed.
                    </div>
                    {txError ? <p>{txError}</p> : null}
                  </div>
                ) : null}

                {txHash ? (
                  <p className="text-[var(--muted)]">
                    Tx:{" "}
                    {blockExplorerUrl ? (
                      <a
                        href={`${blockExplorerUrl.replace(/\/$/, "")}/tx/${txHash}`}
                        className="text-[#ccb98f] underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {formatAddress(txHash)}
                      </a>
                    ) : (
                      formatAddress(txHash)
                    )}
                  </p>
                ) : null}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={resetTransactionState}
                  disabled={anyPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Clear status
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
