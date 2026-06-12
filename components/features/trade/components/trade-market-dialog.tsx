"use client";

import { useMemo, useState } from "react";
import { erc1155Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui";
import { AddTokenToWalletButton } from "@/components/shared/add-token-to-wallet-button";
import { useKnownMezoTokenBalance } from "@/components/shared/use-known-mezo-token-balance";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { detailReadQueryOptions } from "@/lib/web3/read-query-options";
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

  const { address: userAddress } = useAccount();
  const expectedChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = expectedChain.id;

  const marketplace = getContractConfig(expectedChainId, "Marketplace");
  const marketplaceAdmin = getContractConfig(expectedChainId, "MarketplaceAdmin");
  const paymentRouter = getContractConfig(expectedChainId, "PaymentRouter");
  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");
  const marketplaceAdminAddress = marketplaceAdmin?.address;
  const paymentRouterAddress = paymentRouter?.address;
  const assetLedgerAddress = assetLedger?.address;
  const marketplaceAddress = marketplace?.address;

  const asksByBestPrice = useMemo(
    () => sortAsksByBestPrice(market.topListings),
    [market.topListings],
  );
  const bidsByBestPrice = useMemo(() => sortBidsByBestPrice(market.topBids), [market.topBids]);
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

  const hasPausedRead = Boolean(marketplaceAdminAddress);
  const hasFractionRead = Boolean(assetLedgerAddress && assetLedger.abi);
  const hasFractionApprovalRead = Boolean(hasFractionRead && marketplaceAddress);

  const paymentTokenBalance = useKnownMezoTokenBalance({
    ownerAddress: userAddress,
    tokenAddress: market.paymentToken,
    tokenSymbol: market.paymentTokenSymbol,
    spenderAddress: paymentRouterAddress,
    chainId: expectedChainId,
  });

  const reads = useReadContracts({
    allowFailure: true,
    contracts:
      open && userAddress
        ? [
            ...(hasPausedRead && marketplaceAdminAddress
              ? [
                  {
                    address: marketplaceAdminAddress,
                    abi: getContractConfig(expectedChainId, "MarketplaceAdmin")!.abi,
                    functionName: "isPaused",
                    chainId: expectedChainId,
                  },
                ]
              : []),
            ...(hasFractionRead && assetLedgerAddress
              ? [
                  {
                    address: assetLedgerAddress,
                    abi: assetLedger!.abi,
                    functionName: "balanceOf",
                    args: [userAddress, market.trancheId],
                    chainId: expectedChainId,
                  },
                  ...(hasFractionApprovalRead && marketplaceAddress
                    ? [
                        {
                          address: assetLedgerAddress,
                          abi: erc1155Abi,
                          functionName: "isApprovedForAll",
                          args: [userAddress, marketplaceAddress],
                          chainId: expectedChainId,
                        },
                      ]
                    : []),
                ]
              : []),
          ]
        : [],
    query: {
      enabled: Boolean(open && userAddress),
      ...detailReadQueryOptions,
    },
  });

  const isPaused = hasPausedRead ? reads.data?.[0]?.result === true : false;
  const paymentBalance = paymentTokenBalance.balanceRaw;
  const paymentAllowance = paymentTokenBalance.allowanceRaw;
  const fractionBalanceIndex = hasPausedRead ? 1 : 0;
  const fractionBalance = (reads.data?.[fractionBalanceIndex]?.result as bigint | undefined) ?? 0n;
  const fractionApproved =
    hasFractionApprovalRead &&
    (reads.data?.[fractionBalanceIndex + 1]?.result as boolean | undefined) === true;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl overflow-x-hidden overflow-y-auto p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="min-w-0 border-b border-white/10 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="break-words text-2xl">{market.pair} Market</DialogTitle>
              <DialogDescription>
                Trade {market.fractionName} with {market.paymentTokenSymbol}.
              </DialogDescription>
            </div>
            <AddTokenToWalletButton
              address={market.fractionAddress}
              symbol={market.fractionSymbol}
              tokenId={market.trancheId}
              className="shrink-0"
            />
          </div>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <MarketDepthCard market={market} />
            <OrderbookCard
              key={market.id}
              market={market}
              asksByBestPrice={asksByBestPrice}
              bidsByBestPrice={bidsByBestPrice}
              bestAsk={bestAsk}
              bestBid={bestBid}
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

          <div className="min-w-0 space-y-4">
            <div className="hidden lg:block">
              {/* <ReadinessCard
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
              /> */}
            </div>
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
