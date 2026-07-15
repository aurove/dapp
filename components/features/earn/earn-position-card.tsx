"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { formatUnits, type Address } from "viem";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@ui";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import {
  type EarnApyBasisMap,
  type EarnProduct,
  type EarnVariant,
  useEarnProductDetails,
} from "./use-earn-data";

const WEEK_SECONDS = 7n * 24n * 60n * 60n;
const EPOCH_ROLLOVER_COOLDOWN_SECONDS = 2n * 60n * 60n;
const SETTLEMENT_DURATION_SECONDS = 12n * 60n * 60n;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

type PositionActionMode = "withdraw" | "refund";

type TrancheApyEstimate = {
  product: EarnProduct;
  apyPercent: number;
};

export function EarnPositionCard({
  product: initialProduct,
  chainTimestamp,
  apyBasisMap,
  withdrawAmount,
  setWithdrawAmount,
  onSuccess,
  onError,
}: {
  product: EarnProduct;
  chainTimestamp: bigint | null;
  apyBasisMap?: EarnApyBasisMap | null;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const { product, isLoading } = useEarnProductDetails(initialProduct, inView, apyBasisMap);

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
  const apyEstimate = estimateTrancheApy(product);
  const parsedWithdraw = parseAmountRaw(withdrawAmount, product.decimals);
  const isSettlementWindowOpen = isTargetSettlementWindow(product, chainTimestamp);
  const isWithinEpochCooldown = isEpochCooldown(chainTimestamp);
  const isExpired = isTrancheExpired(product, chainTimestamp);
  const [selectedRedemptionKeys, setSelectedRedemptionKeys] = useState<string[]>([]);
  useEffect(() => {
    const availableKeys = new Set(product.refundablePositions.map((position) => position.key));
    setSelectedRedemptionKeys((current) => {
      const next = current.filter((key) => availableKeys.has(key));
      if (next.length > 0) return next;
      const fallback = product.refundablePositions[0]?.key;
      return fallback ? [fallback] : [];
    });
  }, [product.refundablePositions]);
  const selectedRedemptionPositions = product.refundablePositions.filter((position) =>
    selectedRedemptionKeys.includes(position.key),
  );
  const selectedRedemptionTotalRaw = selectedRedemptionPositions.reduce(
    (total, position) => total + position.lockedAmountRaw,
    0n,
  );
  const isActionWindowOpen = isSettlementWindowOpen && product.targetEpochEnd !== null;
  const actionControlId = `redeem-amount-${product.id}`;
  const redemptionAmountRaw =
    product.variant === "veMEZO" ? selectedRedemptionTotalRaw : parsedWithdraw ?? 0n;
  const canSubmit =
    isActionWindowOpen &&
    !isWithinEpochCooldown &&
    selectedRedemptionPositions.length > 0 &&
    redemptionAmountRaw > 0n &&
    redemptionAmountRaw <= product.userAvailableBalanceRaw;
  const actionLabel = "Redeem";
  const actionUnavailableLabel = isExpired ? "Await claim window" : "Await redemption window";
  const actionSteps = (account: Address): TxStep[] => {
    return [
      makeContractWriteStep({
        key: "redeem",
        label: actionLabel,
        displayLabelBtn: true,
        contractName: "Ledger",
        variables: {
          functionName: "redeem",
          args: [
            product.trancheId,
            redemptionAmountRaw,
            account,
            selectedRedemptionPositions.map((position) => position.tokenId),
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile
            label="Available Balance"
            value={formatAmount(product.userAvailableBalanceRaw, product.decimals, product.symbol)}
          />
          <InfoTile
            label="Total Balance"
            value={formatAmount(product.userBalanceRaw, product.decimals, product.symbol)}
          />
          <InfoTile label="Tranche APY" value={formatApyPercent(apyEstimate?.apyPercent)} />
          <InfoTile
            label="Rewards Deposited"
            value={formatAmount(
              product.apyRewardAmountRaw,
              product.rewardDecimals,
              product.rewardSymbol,
            )}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={actionControlId} className="text-sm font-medium text-white">
              Redemption amount
            </label>
            <span className="text-xs text-white/45">
              {isWithinEpochCooldown
                ? "Paused for first 2 hours of epoch rollover"
                : isActionWindowOpen
                  ? isExpired
                    ? "Tranche expired"
                    : "Redemption window open"
                  : "Waiting for redemption window"}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-white">Select veNFTs to redeem</span>
              <span className="text-xs text-white/45">
                Selected{" "}
                {formatAmount(selectedRedemptionTotalRaw, product.decimals, product.symbol)}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {product.refundablePositions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/45 sm:col-span-2">
                  No redeemable veNFTs available.
                </div>
              ) : (
                product.refundablePositions.map((position) => {
                  const checked = selectedRedemptionKeys.includes(position.key);

                  return (
                    <label
                      key={position.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition",
                        checked
                          ? "border-[var(--accent)]/50 bg-[rgba(196,160,106,0.08)] text-white"
                          : "border-white/10 bg-[#080c12]/60 text-white/70 hover:border-white/20",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                        checked={checked}
                        disabled={!isActionWindowOpen || isWithinEpochCooldown}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...selectedRedemptionKeys, position.key]
                            : selectedRedemptionKeys.filter((key) => key !== position.key);
                          setSelectedRedemptionKeys(next);
                        }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-white">#{position.tokenId.toString()}</p>
                        <p className="text-xs text-white/45">
                          {formatAmount(position.lockedAmountRaw, product.decimals, copy.asset)}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {product.variant === "veMEZO" ? (
            <div className="space-y-2">
              <Input
                id={actionControlId}
                inputMode="decimal"
                placeholder="0.00"
                value={formatUnits(selectedRedemptionTotalRaw, product.decimals)}
                disabled
              />
              <p className="text-xs text-white/45">
                MEZO redemption uses the selected veNFTs only. The amount updates from the selected
                tokens automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id={actionControlId}
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
              <p className="text-xs text-white/45">
                BTC redemption can use any selected veNFTs as inventory. Enter the exact amount to
                redeem.
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
                `${product.symbol} redeemed.`,
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
              Redemption actions are paused for 2 hours after epoch rollover so backend claims can
              settle first.
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

function formatAmount(value: bigint | null | undefined, decimals = 18, symbol?: string | null) {
  return formatCompactRawTokenAmount(value, decimals, symbol ?? undefined);
}

function formatApyPercent(value: number | null | undefined) {
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

function estimateTrancheApy(product: EarnProduct): TrancheApyEstimate | null {
  const totalSupplyRaw = product.apyTotalSupplyAtFundingRaw ?? 0n;
  const rewardAmountRaw = product.apyRewardAmountRaw ?? 0n;
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
    apyPercent: (rewardDeposited / totalSupply) * annualization * 100,
  };
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
