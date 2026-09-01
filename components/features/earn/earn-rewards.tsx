"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { type Abi, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Card, CardContent, Skeleton, cn } from "@ui";
import {
  makeId20GaugeClaimStep,
  useId20GaugePositions,
  type Id20GaugePosition,
} from "@/components/features/id20/use-id20-gauges";
import { getRewardSinkAbi } from "@/contracts/earn";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import { useEarnSnapshot } from "./use-earn-data";
import { summarizeClaimables, type ClaimableSummary } from "./utils/claimables";

type RewardAmount = {
  key: string;
  amountRaw: bigint;
  symbol: string;
  decimals: number;
  sourceLabel: string;
};

function rewardTokenFamily(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.includes("BTC")) return "BTC";
  if (normalized.includes("MEZO")) return "MEZO";
  return "Aurove";
}

function RewardTokenMark({ symbol }: { symbol: string }) {
  const family = rewardTokenFamily(symbol);

  return (
    <span className="grid h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#18222b]">
      <Image
        src={`/tokens/${family}.png`}
        alt={`${symbol} reward token`}
        width={28}
        height={28}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function rewardSinkAddresses(summary: ClaimableSummary): Address[] {
  return [
    ...new Set(summary.products.map((product) => product.rewardSinkAddress).filter(Boolean)),
  ].filter((address): address is Address => Boolean(address));
}

function makeTrancheClaimSteps(
  summaries: readonly ClaimableSummary[],
  rewardSinkAbi: Abi | null,
): TxStep[] {
  if (!rewardSinkAbi) return [];

  return summaries.flatMap((summary) =>
    rewardSinkAddresses(summary).map(
      (rewardSinkAddress, index) =>
        makeAddressWriteStep({
          key: `claim-${summary.key}-${rewardSinkAddress}`,
          label: `Claim ${summary.symbol}`,
          displayLabelBtn: index === 0,
          address: rewardSinkAddress,
          abi: rewardSinkAbi,
          variables: {
            functionName: "claimRewards",
            args: [],
          },
        }) as unknown as TxStep,
    ),
  );
}

function trancheRewardAmounts(summaries: readonly ClaimableSummary[]): RewardAmount[] {
  return summaries.map((summary) => ({
    key: `tranche-${summary.key}`,
    amountRaw: summary.amountRaw,
    symbol: summary.symbol,
    decimals: summary.decimals,
    sourceLabel: `${summary.trancheCount} tranche${summary.trancheCount === 1 ? "" : "s"}`,
  }));
}

function id20RewardAmounts(positions: readonly Id20GaugePosition[]): RewardAmount[] {
  return positions.map((position) => ({
    key: `id20-${position.gaugeAddress}`,
    amountRaw: position.claimableRewardRaw,
    symbol: position.symbol,
    decimals: position.decimals,
    sourceLabel: "ID20 gauge",
  }));
}

function RewardMessage({ success, error }: { success: string | null; error: string | null }) {
  if (!success && !error) return null;

  return (
    <p
      role="status"
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        error
          ? "border-red-300/20 bg-red-300/10 text-red-100"
          : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
      )}
    >
      {error ?? success}
    </p>
  );
}

export function EarnRewards() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { products, refresh } = useEarnSnapshot();
  const gauges = useId20GaugePositions(chainId, address);
  const rewardSinkAbi = getRewardSinkAbi(chainId);
  const claimableSummaries = useMemo(() => summarizeClaimables(products), [products]);
  const claimableGauges = useMemo(
    () =>
      gauges.positions.filter(
        (position) => position.isActivated && position.claimableRewardRaw > 0n,
      ),
    [gauges.positions],
  );
  const rewardAmounts = useMemo(
    () => [...trancheRewardAmounts(claimableSummaries), ...id20RewardAmounts(claimableGauges)],
    [claimableGauges, claimableSummaries],
  );
  const trancheClaimSteps = useMemo(
    () => makeTrancheClaimSteps(claimableSummaries, rewardSinkAbi),
    [claimableSummaries, rewardSinkAbi],
  );
  const claimableSourceCount =
    claimableSummaries.reduce((total, summary) => total + summary.trancheCount, 0) +
    claimableGauges.length;
  const canClaim = trancheClaimSteps.length > 0 || claimableGauges.length > 0;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const complete = async () => {
    await gauges.refresh();
    refresh();
    setSuccessMessage(
      `Claimed all available rewards from ${claimableSourceCount} source${claimableSourceCount === 1 ? "" : "s"}.`,
    );
    setErrorMessage(null);
  };

  return (
    <div className="space-y-3">
      <Card className="border-white/10 bg-gradient-to-r from-emerald-300/[0.045] via-white/[0.025] to-transparent">
        <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.5fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-100">
              <Coins className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-medium text-white">Available rewards</h3>
              <p className="text-xs text-white/50">
                {gauges.isLoading
                  ? "Loading tranche and ID20 rewards"
                  : claimableSourceCount > 0
                    ? `Across ${claimableSourceCount} claimable source${claimableSourceCount === 1 ? "" : "s"}`
                    : "No rewards available to claim"}
              </p>
            </div>
          </div>

          <div className="flex min-h-16 min-w-0 flex-wrap items-center rounded-xl border border-white/[0.06] bg-white/[0.035] px-1">
            {rewardAmounts.map((reward, index) => (
              <div
                key={reward.key}
                className={cn(
                  "flex min-w-36 flex-1 items-center gap-2 px-4 py-2",
                  index > 0 && "border-l border-white/10",
                )}
              >
                <RewardTokenMark symbol={reward.symbol} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {formatCompactRawTokenAmount(reward.amountRaw, reward.decimals, null)}
                  </p>
                  <p className="truncate text-xs text-white/55">
                    {reward.symbol} · {reward.sourceLabel}
                  </p>
                </div>
              </div>
            ))}
            {gauges.isLoading ? (
              <div className="min-w-36 flex-1 px-4 py-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ) : rewardAmounts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-white/45">
                Your tranche and ID20 rewards will appear here.
              </p>
            ) : null}
          </div>

          <div className="shrink-0 lg:min-w-44">
            <TransactionFlowButton
              className="w-full"
              steps={({ account }) => [
                ...trancheClaimSteps,
                ...claimableGauges.map((position) =>
                  makeId20GaugeClaimStep(position, account, true),
                ),
              ]}
              disabled={!address || gauges.isLoading || !canClaim}
              icon={<Coins className="h-4 w-4" />}
              onComplete={() => void complete()}
              onError={(message) => {
                setSuccessMessage(null);
                setErrorMessage(message);
              }}
            >
              Claim all
            </TransactionFlowButton>
          </div>
        </CardContent>
      </Card>

      {gauges.error ? (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
        >
          ID20 gauge rewards are temporarily unavailable. Tranche rewards remain visible.
        </p>
      ) : null}
      {claimableSummaries.length > 0 && !rewardSinkAbi ? (
        <p
          role="status"
          className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
        >
          Tranche reward claims are not configured on this network.
        </p>
      ) : null}
      <RewardMessage success={successMessage} error={errorMessage} />
    </div>
  );
}
