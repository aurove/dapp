"use client";

import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { type Abi, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ui";
import {
  makeId20GaugeClaimStep,
  useId20GaugePositions,
  type Id20GaugePosition,
} from "@/components/features/id20/use-id20-gauges";
import { FeatureStatusPanel } from "@/components/features/shared/page-shell";
import { getRewardSinkAbi } from "@/contracts/earn";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import { useEarnSnapshot } from "./use-earn-data";
import { summarizeClaimables, type ClaimableSummary } from "./utils/claimables";
import { claimAllGaugeLabel, id20RewardsPanelState } from "./utils/rewards-status";
import { txError } from "./utils/tx-error";

function Id20GaugeRewardCard({
  position,
  account,
  onComplete,
  onError,
}: {
  position: Id20GaugePosition;
  account?: Address;
  onComplete: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const canClaim = Boolean(account && position.isActivated && position.claimableRewardRaw > 0n);
  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{position.symbol}</p>
          <p className="mt-1 text-xs text-white/42">Reward token: {position.symbol}</p>
        </div>
        <Badge
          className={
            position.isActivated
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/20 bg-amber-300/10 text-amber-100"
          }
        >
          {position.isActivated ? "Active" : "Activation required"}
        </Badge>
      </div>
      <div>
        <p className="text-xs text-white/42">Currently claimable</p>
        <p className="mt-1 break-words text-xl font-semibold text-white">
          {formatCompactRawTokenAmount(
            position.claimableRewardRaw,
            position.decimals,
            position.symbol,
          )}
        </p>
      </div>
      <TransactionFlowButton
        className="w-full"
        size="sm"
        variant="secondary"
        disabled={!canClaim}
        steps={() => (account ? [makeId20GaugeClaimStep(position, account, true)] : [])}
        onComplete={() => void onComplete(`${position.symbol} gauge rewards claimed successfully.`)}
        onError={txError(onError)}
      >
        {position.claimableRewardRaw > 0n ? `Claim ${position.symbol}` : "Nothing to claim"}
      </TransactionFlowButton>
    </div>
  );
}

function Id20GaugeRewardsPanel({
  chainId,
  onPortfolioRefresh,
  onSuccess,
  onError,
}: {
  chainId: number;
  onPortfolioRefresh: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { address } = useAccount();
  const gauges = useId20GaugePositions(chainId, address);
  const claimablePositions = gauges.positions.filter(
    (position) => position.isActivated && position.claimableRewardRaw > 0n,
  );
  const panelState = id20RewardsPanelState({
    isLoading: gauges.isLoading,
    error: gauges.error,
    positionCount: gauges.positions.length,
  });

  const complete = async (message: string) => {
    await gauges.refresh();
    onPortfolioRefresh();
    onSuccess(message);
  };

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-[var(--accent)]" />
              ID20 gauge rewards
            </CardTitle>
            <CardDescription>
              Claim rewards accounted by each liquid position&apos;s canonical ID20 gauge.
            </CardDescription>
          </div>
          <TransactionFlowButton
            size="sm"
            variant="secondary"
            disabled={!address || claimablePositions.length === 0}
            steps={() =>
              address
                ? claimablePositions.map((position) =>
                    makeId20GaugeClaimStep(position, address, true),
                  )
                : []
            }
            onComplete={() => void complete(claimAllGaugeLabel(claimablePositions.length))}
            onError={txError(onError)}
          >
            Claim all
          </TransactionFlowButton>
        </div>
      </CardHeader>
      <CardContent>
        {panelState === "loading" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : panelState === "error" ? (
          <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100">
            {gauges.error instanceof Error
              ? gauges.error.message
              : "ID20 gauge rewards are temporarily unavailable."}
          </div>
        ) : panelState === "empty" ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/55">
            No ID20 positions or gauge reward balances were found for this wallet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {gauges.positions.map((position) => (
              <Id20GaugeRewardCard
                key={position.gaugeAddress}
                position={position}
                account={address}
                onComplete={complete}
                onError={onError}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimableTokenButton({
  summary,
  rewardSinkAbi,
  onSuccess,
  onError,
}: {
  summary: ClaimableSummary;
  rewardSinkAbi: Abi | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const rewardSinkAddresses = useMemo(
    () =>
      [
        ...new Set(summary.products.map((product) => product.rewardSinkAddress).filter(Boolean)),
      ].filter((address): address is Address => Boolean(address)),
    [summary.products],
  );

  const isDisabled = rewardSinkAddresses.length === 0;

  return (
    <TransactionFlowButton
      className="w-full"
      size="sm"
      variant="secondary"
      disabled={isDisabled || !rewardSinkAbi}
      steps={() =>
        rewardSinkAddresses.map(
          (rewardSinkAddress, index) =>
            makeAddressWriteStep({
              key: `claim-${summary.key}-${rewardSinkAddress}`,
              label: `Claim ${summary.symbol}`,
              displayLabelBtn: index === 0,
              address: rewardSinkAddress,
              abi: rewardSinkAbi as Abi,
              variables: {
                functionName: "claimRewards",
                args: [],
              },
            }) as unknown as TxStep,
        )
      }
      onComplete={() => {
        onSuccess(
          `${summary.symbol} rewards claimed from ${summary.trancheCount} tranche${summary.trancheCount === 1 ? "" : "s"}.`,
        );
      }}
      onError={txError(onError)}
    >
      {`Claim ${summary.symbol}`}
    </TransactionFlowButton>
  );
}

function ClaimablesPanel({
  summaries,
  rewardSinkAbi,
  onSuccess,
  onError,
}: {
  summaries: ClaimableSummary[];
  rewardSinkAbi: Abi | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const totalTranches = summaries.reduce(
    (total, claimable) => claimable.products.length + total,
    0,
  );

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-[var(--accent)]" />
              Claimables
            </CardTitle>
            <CardDescription>Aggregated rewards across all held veNFT positions.</CardDescription>
          </div>
          <Badge className="border-white/15 bg-white/[0.04] text-white/70">
            {totalTranches} claimable tranche{totalTranches === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {summaries.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/55">
            No claimable rewards found across your fraction tranches.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {summaries.map((summary) => (
              <div
                key={summary.key}
                className="space-y-4 rounded-xl border border-white/10 bg-white/[0.025] p-4"
              >
                <p className="text-xs text-white/42">
                  {summary.trancheCount} of {totalTranches} claimable tranche
                  {summary.trancheCount === 1 ? "" : "s"}
                </p>
                <p className="mt-2 break-words text-xl font-semibold text-white">
                  {formatCompactRawTokenAmount(summary.amountRaw, summary.decimals, summary.symbol)}
                </p>
                <ClaimableTokenButton
                  summary={summary}
                  rewardSinkAbi={rewardSinkAbi}
                  onSuccess={onSuccess}
                  onError={onError}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EarnRewards() {
  const { products, refresh } = useEarnSnapshot();
  const chainId = useChainId();
  const rewardSinkAbi = getRewardSinkAbi(chainId);
  const claimableSummaries = useMemo(() => summarizeClaimables(products), [products]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSuccess = (message: string, options?: { skipRefresh?: boolean }) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    if (!options?.skipRefresh) {
      refresh();
    }
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  return (
    <section className="space-y-4" aria-labelledby="earn-rewards-title">
      <div>
        <h2 id="earn-rewards-title" className="text-2xl font-semibold text-white">
          Rewards
        </h2>
        <p className="mt-1 text-sm text-white/55">
          Claim tranche rewards and ID20 gauge rewards from your liquid positions.
        </p>
      </div>

      {successMessage ? (
        <FeatureStatusPanel tone="success" title="Transaction complete" message={successMessage} />
      ) : null}
      {errorMessage ? (
        <FeatureStatusPanel tone="error" title="Transaction failed" message={errorMessage} />
      ) : null}

      <ClaimablesPanel
        summaries={claimableSummaries}
        rewardSinkAbi={rewardSinkAbi}
        onSuccess={(message) => handleSuccess(message)}
        onError={handleError}
      />
      <Id20GaugeRewardsPanel
        chainId={chainId}
        onPortfolioRefresh={refresh}
        onSuccess={(message) => handleSuccess(message, { skipRefresh: true })}
        onError={handleError}
      />
    </section>
  );
}
