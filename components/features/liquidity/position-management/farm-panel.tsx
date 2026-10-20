"use client";

import { useRef } from "react";
import { Coins, Lock, Unlock } from "lucide-react";
import { useAccount } from "wagmi";
import type { Abi } from "viem";

import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { amount } from "../position-display";
import {
  buildGaugeClaimStep,
  buildGaugeStakeSteps,
  buildGaugeUnstakeStep,
} from "./tx";
import type { PositionManageSharedProps } from "./shared";

export function FarmPanel({
  position,
  gauge,
  rewardTokenMeta,
  managerAddress,
  onComplete,
  onError,
}: PositionManageSharedProps) {
  const { address } = useAccount();
  const stakeRef = useRef<TransactionFlowButtonHandle>(null);
  const unstakeRef = useRef<TransactionFlowButtonHandle>(null);
  const claimRef = useRef<TransactionFlowButtonHandle>(null);
  const earnedLabel = amount(
    position.gaugeEarnedRaw,
    rewardTokenMeta ?? (position.rewardToken
      ? { symbol: "MEZO", decimals: 18, address: position.rewardToken, rawBalance: 0n }
      : undefined),
  );
  const stakeSteps = address && gauge && !position.isStaked && position.liquidity > 0n
    ? buildGaugeStakeSteps({
        tokenId: position.tokenId,
        managerAddress,
        gaugeAddress: gauge.address,
        gaugeAbi: gauge.abi as Abi,
      })
    : [];
  const unstakeSteps = address && gauge && position.isStaked
    ? [buildGaugeUnstakeStep({
        tokenId: position.tokenId,
        gaugeAddress: gauge.address,
        gaugeAbi: gauge.abi as Abi,
      })]
    : [];
  const claimSteps = address && gauge && position.isStaked
    ? [buildGaugeClaimStep({
        tokenId: position.tokenId,
        gaugeAddress: gauge.address,
        gaugeAbi: gauge.abi as Abi,
      })]
    : [];

  return (
    <div className="space-y-4 rounded-2xl border border-foreground/15 bg-foreground/[0.03] p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${position.isStaked ? "bg-emerald-300/10 text-emerald-800 dark:text-emerald-100" : "bg-sky-300/10 text-sky-800 dark:text-sky-100"}`}>
          {position.isStaked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </span>
        <div>
          <h4 className="font-medium text-foreground">{position.isStaked ? "Farming" : "Farm this position"}</h4>
          <p className="mt-1 text-sm text-muted">
            {position.isStaked
              ? `NFT #${position.tokenId.toString()} is deposited in the ${position.poolKey} gauge. Unstake returns the NFT and claims outstanding emissions in the same transaction.`
              : `Deposit NFT #${position.tokenId.toString()} into the ${position.poolKey} gauge to earn emissions. Swap fees still accrue while the range is active.`}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-foreground/[0.07] bg-foreground/[0.03] px-4 py-3">
          <p className="text-xs text-muted">{position.isStaked ? "Claimable emissions" : "Position"}</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {position.isStaked ? earnedLabel : `NFT #${position.tokenId.toString()}`}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/[0.07] bg-foreground/[0.03] px-4 py-3">
          <p className="text-xs text-muted">Gauge</p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{gauge?.key ?? "Unavailable"}</p>
        </div>
      </div>

      {!gauge ? (
        <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          No CL gauge is configured for this pool on the current network.
        </p>
      ) : position.isStaked ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <TransactionFlowButton
            ref={claimRef}
            className="w-full"
            variant="secondary"
            steps={claimSteps}
            disabled={!address || claimSteps.length === 0 || (position.gaugeEarnedRaw ?? 0n) <= 0n}
            icon={<Coins className="h-4 w-4" />}
            onComplete={onComplete("Gauge rewards claimed.")}
            onError={onError}
          >
            Claim rewards
          </TransactionFlowButton>
          <TransactionFlowButton
            ref={unstakeRef}
            className="w-full"
            steps={unstakeSteps}
            disabled={!address || unstakeSteps.length === 0}
            icon={<Unlock className="h-4 w-4" />}
            onComplete={onComplete("Position unstaked. Outstanding emissions were claimed.")}
            onError={onError}
          >
            Unstake
          </TransactionFlowButton>
        </div>
      ) : position.liquidity <= 0n ? (
        <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Add liquidity before farming this empty position.
        </p>
      ) : (
        <TransactionFlowButton
          ref={stakeRef}
          className="w-full"
          steps={stakeSteps}
          disabled={!address || stakeSteps.length === 0}
          icon={<Lock className="h-4 w-4" />}
          onComplete={onComplete("Position staked in the gauge.")}
          onError={onError}
        >
          Stake NFT
        </TransactionFlowButton>
      )}
    </div>
  );
}
