"use client";

import { useMemo, useState } from "react";
import { erc20Abi, type Address, erc1155Abi } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@fractals/ui/ui/dialog";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import type { TradeMarket } from "../types";
import {
  getBestAsk,
  getBestBid,
  getMidPrice,
  getSpread,
  sortAsksByBestPrice,
  sortBidsByBestPrice,
} from "../utils/pricing";
import {
  MarketDepthCard,
  OrderbookCard,
  ReadinessCard,
  TradeActionsCard,
  type TradeTab,
} from "./trade-market-dialog-sections";

type TradeMarketDialogProps = {
  market: TradeMarket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTradeExecuted?: () => void;
};

export function TradeMarketDialog({
  market,
  open,
  onOpenChange,
  onTradeExecuted,
}: TradeMarketDialogProps) {
  const [tab, setTab] = useState<TradeTab>("buy");
  const [buyListingIdOverride, setBuyListingId] = useState<string | null>(null);
  const [sellBidIdOverride, setSellBidId] = useState<string | null>(null);

  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = activeChain.id;
  const chainId = txFlowChainId ?? expectedChainId;
  const isCorrectNetwork = chainId === expectedChainId;

  const marketplace = getContractConfig(expectedChainId, "Marketplace");
  const marketplaceAdmin = getContractConfig(expectedChainId, "MarketplaceAdmin");
  const paymentRouter = getContractConfig(expectedChainId, "PaymentRouter");
  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");

  const asksByBestPrice = useMemo(
    () => sortAsksByBestPrice(market.topListings),
    [market.topListings],
  );
  const bidsByBestPrice = useMemo(() => sortBidsByBestPrice(market.topBids), [market.topBids]);
  const renderedAsks = useMemo(() => [...asksByBestPrice].reverse(), [asksByBestPrice]);
  const bestAsk = useMemo(() => getBestAsk(asksByBestPrice), [asksByBestPrice]);
  const bestBid = useMemo(() => getBestBid(bidsByBestPrice), [bidsByBestPrice]);
  const spreadRaw = useMemo(() => getSpread(bestAsk, bestBid), [bestAsk, bestBid]);
  const midPriceRaw = useMemo(() => getMidPrice(bestAsk, bestBid), [bestAsk, bestBid]);

  const buyListingId =
    buyListingIdOverride &&
    market.topListings.some((entry) => entry.listingId.toString() === buyListingIdOverride)
      ? buyListingIdOverride
      : bestAsk?.listingId.toString() || "";

  const sellBidId =
    sellBidIdOverride &&
    market.topBids.some((entry) => entry.bidId.toString() === sellBidIdOverride)
      ? sellBidIdOverride
      : bestBid?.bidId.toString() || "";

  const selectedListing = useMemo(
    () => market.topListings.find((entry) => entry.listingId.toString() === buyListingId) ?? null,
    [buyListingId, market.topListings],
  );

  const selectedBid = useMemo(
    () => market.topBids.find((entry) => entry.bidId.toString() === sellBidId) ?? null,
    [market.topBids, sellBidId],
  );

  const pausedRead = useReadContract({
    address: marketplaceAdmin?.address,
    abi: getContractConfig(expectedChainId, "MarketplaceAdmin")!.abi,
    functionName: "isPaused",
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && marketplaceAdmin?.address),
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
    abi: erc1155Abi,
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
            <MarketDepthCard market={market} />
            <OrderbookCard
              market={market}
              renderedAsks={renderedAsks}
              bidsByBestPrice={bidsByBestPrice}
              bestAsk={bestAsk}
              bestBid={bestBid}
              buyListingId={buyListingId}
              sellBidId={sellBidId}
              spreadRaw={spreadRaw}
              midPriceRaw={midPriceRaw}
              onAskSelect={(listingId) => {
                setBuyListingId(listingId);
                setTab("buy");
              }}
              onBidSelect={(bidId) => {
                setSellBidId(bidId);
                setTab("sell");
              }}
            />
          </div>

          <div className="space-y-4">
            <ReadinessCard
              activeChainName={activeChain.name}
              fractionApproved={fractionApproved}
              fractionBalance={fractionBalance}
              isConnected={isConnected}
              isCorrectNetwork={isCorrectNetwork}
              isPaused={isPaused}
              paymentAllowance={paymentAllowance}
              paymentBalance={paymentBalance}
              paymentTokenSymbol={market.paymentTokenSymbol}
              readinessError={readinessError}
            />
            <TradeActionsCard
              activeTab={tab}
              assetLedgerAddress={assetLedger?.address}
              fractionApproved={fractionApproved}
              fractionBalance={fractionBalance}
              isPaused={isPaused}
              market={market}
              marketplaceAbi={marketplace?.abi}
              marketplaceAddress={marketplace?.address}
              onTabChange={setTab}
              onTradeExecuted={onTradeExecuted}
              paymentAllowance={paymentAllowance}
              paymentBalance={paymentBalance}
              paymentRouterAddress={paymentRouter?.address}
              selectedBid={selectedBid}
              selectedListing={selectedListing}
              userAddress={userAddress}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
