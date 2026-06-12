"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { formatUnits, type Address } from "viem";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@ui";
import { AddTokenToWalletButton } from "@/components/shared/add-token-to-wallet-button";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import {
  type EarnAprBasisMap,
  type EarnProduct,
  type EarnVariant,
  useEarnProductDetails,
} from "./use-earn-data";

const WEEK_SECONDS = 7n * 24n * 60n * 60n;
const EPOCH_ROLLOVER_COOLDOWN_SECONDS = 2n * 60n * 60n;
const SETTLEMENT_DURATION_SECONDS = 12n * 60n * 60n;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

type PositionActionMode = "withdraw" | "refund";

type TrancheAprEstimate = {
  product: EarnProduct;
  aprPercent: number;
};

export function EarnPositionCard({
  product: initialProduct,
  chainTimestamp,
  aprBasisMap,
  withdrawAmount,
  setWithdrawAmount,
  onSuccess,
  onError,
}: {
  product: EarnProduct;
  chainTimestamp: bigint | null;
  aprBasisMap?: EarnAprBasisMap | null;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { product, isLoading } = useEarnProductDetails(initialProduct, inView, aprBasisMap);

  return (
    <div ref={ref} className="min-h-[30rem]">
      {inView ? (
        <PositionCardContent
          product={product}
          chainTimestamp={chainTimestamp}
          withdrawAmount={withdrawAmount}
          setWithdrawAmount={setWithdrawAmount}
          onSuccess={onSuccess}
          onError={onError}
          isLoading={isLoading}
        />
      ) : (
        <PositionCardShell product={initialProduct} />
      )}
    </div>
  );
}

function PositionCardContent({
  product,
  chainTimestamp,
  withdrawAmount,
  setWithdrawAmount,
  onSuccess,
  onError,
  isLoading,
}: {
  product: EarnProduct;
  chainTimestamp: bigint | null;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  isLoading: boolean;
}) {
  const copy = variantCopy(product.variant);
  const progress = epochProgressPercent(product, chainTimestamp);
  const aprEstimate = estimateTrancheApr(product);
  const parsedWithdraw = parseAmountRaw(withdrawAmount, product.decimals);
  const isSettlementWindowOpen = isTargetSettlementWindow(product, chainTimestamp);
  const isWithinEpochCooldown = isEpochCooldown(chainTimestamp);
  const isExpired = isTrancheExpired(product, chainTimestamp);
  const [actionModeState, setActionMode] = useState<PositionActionMode>(
    isExpired ? "withdraw" : "refund",
  );
  const [selectedRefundKeyState, setSelectedRefundKey] = useState("");
  const selectedRefundKey = product.refundablePositions.some(
    (position) => position.key === selectedRefundKeyState,
  )
    ? selectedRefundKeyState
    : (product.refundablePositions[0]?.key ?? "");
  const selectedRefundPosition =
    product.refundablePositions.find((position) => position.key === selectedRefundKey) ?? null;
  const isActionWindowOpen = isSettlementWindowOpen && product.targetEpochEnd !== null;
  const effectiveActionMode: PositionActionMode = isExpired ? actionModeState : "refund";
  const canWithdraw =
    effectiveActionMode === "withdraw" &&
    isExpired &&
    parsedWithdraw !== null &&
    parsedWithdraw <= product.userAvailableBalanceRaw &&
    parsedWithdraw > 0n;
  const canRefund =
    effectiveActionMode === "refund" &&
    selectedRefundPosition !== null &&
    selectedRefundPosition.lockedAmountRaw <= product.userAvailableBalanceRaw;
  const canSubmit = isActionWindowOpen && !isWithinEpochCooldown && (canWithdraw || canRefund);
  const actionLabel = effectiveActionMode === "withdraw" ? "Withdraw underlying" : "Refund veNFT";
  const actionUnavailableLabel = isExpired ? "Await settlement window" : "Await refund window";
  const actionSteps = (account: Address): TxStep[] => {
    if (effectiveActionMode === "withdraw") {
      return [
        makeContractWriteStep({
          key: "withdraw",
          label: actionLabel,
          displayLabelBtn: true,
          contractName: "AssetLedger",
          variables: {
            functionName: "withdraw",
            args: [product.trancheId, parsedWithdraw ?? 0n, account],
          },
        }) as unknown as TxStep,
      ];
    }

    return [
      makeContractWriteStep({
        key: "refund",
        label: actionLabel,
        displayLabelBtn: true,
        contractName: "AssetLedger",
        variables: {
          functionName: "refund",
          args: [
            product.trancheId,
            selectedRefundPosition?.veNft ?? "0x0000000000000000000000000000000000000000",
            selectedRefundPosition?.tokenId ?? 0n,
            selectedRefundPosition?.lockedAmountRaw ?? 0n,
            account,
          ],
        },
      }) as unknown as TxStep,
    ];
  };

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge className={copy.tone}>{copy.headline}</Badge>
            <CardTitle className="mt-3 text-lg">{product.symbol}</CardTitle>
            <CardDescription>{product.name}</CardDescription>
          </div>
          <AddTokenToWalletButton
            address={product.fractionAddress}
            symbol={product.symbol}
            decimals={product.decimals}
            tokenId={product.trancheId}
            className="shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-2 w-24 rounded-full" /> : null}
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-white">Target epoch progress</span>
            <span className="text-white/45">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-white/45">
            <span>{formatDuration(product.trancheDuration, product.trancheNumber)}</span>
            <span>{formatDate(product.targetEpochEnd)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <InfoTile
            label="Available Balance"
            value={formatAmount(product.userAvailableBalanceRaw, product.decimals, product.symbol)}
          />
          <InfoTile
            label="Total Balance"
            value={formatAmount(product.userBalanceRaw, product.decimals, product.symbol)}
          />
          <InfoTile label="Tranche APR" value={formatAprPercent(aprEstimate?.aprPercent)} />
          <InfoTile
            label="Rewards Deposited"
            value={formatAmount(
              product.aprRewardAmountRaw,
              product.rewardDecimals,
              product.rewardSymbol,
            )}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`withdraw-${product.id}`} className="text-sm font-medium text-white">
              {actionLabel}
            </label>
            <span className="text-xs text-white/45">
              {isWithinEpochCooldown
                ? "Paused for first 2 hours of epoch rollover"
                : isActionWindowOpen
                  ? isExpired
                    ? "Tranche expired"
                    : "Settlement window open"
                  : "Waiting for settlement window"}
            </span>
          </div>
          {isExpired ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-[#080c12]/60 p-1">
              {[
                { value: "withdraw", label: "Withdraw" },
                { value: "refund", label: "Refund" },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/60 transition",
                    actionModeState === option.value && "bg-white/10 text-white shadow-inner",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`position-action-${product.id}`}
                    value={option.value}
                    checked={actionModeState === option.value}
                    onChange={() => setActionMode(option.value as PositionActionMode)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : null}
          {effectiveActionMode === "withdraw" ? (
            <div className="flex gap-2">
              <Input
                id={`withdraw-${product.id}`}
                inputMode="decimal"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                disabled={!isActionWindowOpen || isWithinEpochCooldown}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setWithdrawAmount(formatUnits(product.userAvailableBalanceRaw, product.decimals))
                }
                disabled={!isActionWindowOpen || isWithinEpochCooldown}
              >
                Max
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                id={`refund-${product.id}`}
                value={selectedRefundKey}
                onChange={(event) => setSelectedRefundKey(event.target.value)}
                disabled={
                  !isActionWindowOpen ||
                  isWithinEpochCooldown ||
                  product.refundablePositions.length === 0
                }
                className="h-11 w-full rounded-lg border border-white/10 bg-[#101820] px-3 text-sm text-white outline-none transition focus:border-[var(--accent)] disabled:opacity-50"
              >
                {product.refundablePositions.length === 0 ? (
                  <option value="">No refundable veNFTs</option>
                ) : null}
                {product.refundablePositions.map((position) => (
                  <option key={position.key} value={position.key}>
                    #{position.tokenId.toString()} -{" "}
                    {formatAmount(position.lockedAmountRaw, product.decimals, copy.asset)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/45">
                Refund burns the exact locked amount and returns the selected managed veNFT.
              </p>
            </div>
          )}
          <TransactionFlowButton
            className="w-full"
            variant="secondary"
            disabled={!canSubmit}
            steps={({ account }) => actionSteps(account)}
            onComplete={() => {
              setWithdrawAmount("");
              onSuccess(
                effectiveActionMode === "withdraw"
                  ? `${product.symbol} underlying withdrawn.`
                  : `${product.symbol} veNFT refunded.`,
              );
            }}
            onError={txError(onError)}
          >
            {isWithinEpochCooldown
              ? "Temporarily paused"
              : isActionWindowOpen
                ? actionLabel
                : actionUnavailableLabel}
          </TransactionFlowButton>
          {isWithinEpochCooldown ? (
            <p className="text-xs text-amber-100/80">
              Withdraw/refund actions are paused for 2 hours after epoch rollover so backend claims
              can settle first.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PositionCardShell({ product }: { product: EarnProduct }) {
  const copy = variantCopy(product.variant);

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge className={copy.tone}>{copy.headline}</Badge>
            <CardTitle className="mt-3 text-lg">{product.symbol}</CardTitle>
            <CardDescription>{product.name}</CardDescription>
          </div>
          <AddTokenToWalletButton
            address={product.fractionAddress}
            symbol={product.symbol}
            decimals={product.decimals}
            tokenId={product.trancheId}
            className="shrink-0"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </CardContent>
    </Card>
  );
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [inView]);

  return { ref, inView };
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <p className="text-xs text-white/42">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function formatDate(timestamp: bigint | null) {
  if (!timestamp || timestamp === 0n) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

function formatDuration(seconds: bigint | null, fallbackWeeks: number) {
  if (!seconds || seconds === 0n) return `${fallbackWeeks} weeks`;
  const weeks = Number(seconds / (7n * 24n * 60n * 60n));
  return `${weeks} weeks`;
}

function formatAmount(value: bigint | null | undefined, decimals = 18, symbol?: string | null) {
  return formatCompactRawTokenAmount(value, decimals, symbol ?? undefined);
}

function formatAprPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not estimated";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return (
    new Intl.NumberFormat(undefined, {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value) + "%"
  );
}

function estimateTrancheApr(product: EarnProduct): TrancheAprEstimate | null {
  const totalSupplyRaw = product.aprTotalSupplyAtFundingRaw ?? 0n;
  const rewardAmountRaw = product.aprRewardAmountRaw ?? 0n;
  if (totalSupplyRaw <= 0n || rewardAmountRaw <= 0n) return null;

  const rewardDeposited = Number(formatUnits(rewardAmountRaw, product.rewardDecimals));
  const totalSupply = Number(formatUnits(totalSupplyRaw, 18));
  if (!Number.isFinite(rewardDeposited) || !Number.isFinite(totalSupply) || totalSupply <= 0) {
    return null;
  }

  const durationSeconds =
    product.trancheDuration && product.trancheDuration > 0n
      ? Number(product.trancheDuration)
      : null;
  const annualization =
    durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? SECONDS_PER_YEAR / durationSeconds
      : 1;

  return {
    product,
    aprPercent: (rewardDeposited / totalSupply) * annualization * 100,
  };
}

function epochProgressPercent(product: EarnProduct, blockchainNow: bigint | null): number {
  if (blockchainNow === null || !product.trancheDuration) return 0;
  if (product.refundablePositions.length === 0) return 100;

  const maxUnlock = (max: bigint, pos: EarnProduct["refundablePositions"][number]) =>
    pos.unlockTime ? (pos.unlockTime > max ? pos.unlockTime : max) : max;
  const start = product.refundablePositions.reduce(maxUnlock, 0n) - product.trancheDuration;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(Number((blockchainNow - start) * 100n) / Number(product.trancheDuration)),
    ),
  );
}

function isTargetSettlementWindow(product: EarnProduct, blockchainNow: bigint | null): boolean {
  if (blockchainNow === null) return product.isTargetSettlementWindow;
  const epochStart = (blockchainNow / WEEK_SECONDS) * WEEK_SECONDS;
  return blockchainNow <= epochStart + SETTLEMENT_DURATION_SECONDS;
}

function isEpochCooldown(blockchainNow: bigint | null): boolean {
  if (blockchainNow === null) return false;
  const epochStart = (blockchainNow / WEEK_SECONDS) * WEEK_SECONDS;
  return (
    blockchainNow >= epochStart && blockchainNow < epochStart + EPOCH_ROLLOVER_COOLDOWN_SECONDS
  );
}

function isTrancheExpired(product: EarnProduct, blockchainNow: bigint | null): boolean {
  if (blockchainNow !== null) {
    return product.refundablePositions.some(
      (position) => position.unlockTime !== null && position.unlockTime <= blockchainNow,
    );
  }

  return false;
}

function txError(handler: (message: string) => void) {
  return (err: string | SyntheticEvent<HTMLButtonElement>) => {
    if (typeof err === "string") {
      handler(err);
    }
  };
}

function variantCopy(variant: EarnVariant) {
  return variant === "veBTC"
    ? {
        headline: "BTC-backed fungible Earn products",
        asset: "BTC",
        tone: "border-amber-300/25 bg-amber-300/10 text-amber-100",
      }
    : {
        headline: "MEZO-backed fungible Earn products",
        asset: "MEZO",
        tone: "border-sky-300/25 bg-sky-300/10 text-sky-100",
      };
}
