"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { formatUnits, type Abi, type Address } from "viem";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useAccount, useChainId } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@ui";
import { getEarnProtocolConfig } from "@/contracts/earn";
import {
  makeId20GaugeClaimStep,
  useId20GaugePositions,
} from "@/components/features/id20/use-id20-gauges";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import {
  type EarnApyBasisMap,
  type EarnProduct,
  type EarnVariant,
  useEarnProductDetails,
} from "./use-earn-data";
import { estimateTrancheApy, formatApyPercent } from "./utils/apy";

const WEEK_SECONDS = 7n * 24n * 60n * 60n;
const SETTLEMENT_WINDOW_START_SECONDS = 10n * 60n * 60n;
const SETTLEMENT_WINDOW_DURATION_SECONDS = 6n * 60n * 60n;

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
  const { product } = useEarnProductDetails(initialProduct, inView, apyBasisMap);

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
}: {
  product: EarnProduct;
  chainTimestamp: bigint | null;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const transactionRef = useRef<TransactionFlowButtonHandle>(null);
  const unwrapTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const chainId = useChainId();
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const id20Abi = (
    product.variant === "veBTC" ? earnContracts.auroveId20 : earnContracts.mezoAuroveId20
  )?.abi as Abi | undefined;
  const copy = variantCopy(product.variant);
  const apyEstimate = estimateTrancheApy(product);
  const parsedWithdraw = parseAmountRaw(withdrawAmount, product.decimals);
  const isSettlementWindowOpen = resolveSettlementWindowOpen(product, chainTimestamp);
  const isExpired = isTrancheExpired(product, chainTimestamp);
  const [unwrapAmount, setUnwrapAmount] = useState("");
  const [selectedRedemptionKeys, setSelectedRedemptionKeys] = useState<string[]>([]);
  const selectedRedemptionKeysResolved = useMemo(() => {
    const availableKeys = new Set(product.redeemInventory.map((position) => position.key));
    const next = selectedRedemptionKeys.filter((key) => availableKeys.has(key));
    if (next.length > 0) return next;

    const fallback = product.redeemInventory[0]?.key;
    return fallback ? [fallback] : [];
  }, [product.redeemInventory, selectedRedemptionKeys]);
  const selectedRedemptionPositions = product.redeemInventory.filter((position) =>
    selectedRedemptionKeysResolved.includes(position.key),
  );
  /** Selected inventory free size after withdrawManaged (weight + locked-managed rewards). */
  const selectedRedemptionTotalRaw = selectedRedemptionPositions.reduce(
    (total, position) => total + position.lockedAmountRaw,
    0n,
  );
  const isActionWindowOpen = isSettlementWindowOpen;
  const actionControlId = `redeem-amount-${product.id}`;
  // MEZO amount is auto weight+earned of the selection (same basis as inventory display / free size).
  // BTC uses a user-entered exact share amount.
  const redemptionAmountRaw =
    product.variant === "veMEZO" ? selectedRedemptionTotalRaw : parsedWithdraw ?? 0n;
  const mezoInventoryExceedsBalance =
    product.variant === "veMEZO" &&
    selectedRedemptionTotalRaw > 0n &&
    selectedRedemptionTotalRaw > product.userAvailableBalanceRaw;
  const canSubmit =
    isActionWindowOpen &&
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
  const formik = useFormik({
    initialValues: {
      amount:
        product.variant === "veMEZO"
          ? formatUnits(selectedRedemptionTotalRaw, product.decimals)
          : withdrawAmount,
      redemptionKeys: selectedRedemptionKeysResolved,
    },
    enableReinitialize: true,
    validationSchema: Yup.object({
      amount: Yup.string()
        .required("Enter a redemption amount.")
        .test("valid-amount", function validateRedeemAmount(value) {
          if (product.variant === "veMEZO") {
            if (selectedRedemptionPositions.length === 0) {
              return this.createError({ message: "Select at least one vault veNFT." });
            }
            if (selectedRedemptionTotalRaw <= 0n) {
              return this.createError({
                message: "Selected veNFTs have no redeemable size yet (still loading or empty).",
              });
            }
            if (selectedRedemptionTotalRaw > product.userAvailableBalanceRaw) {
              return this.createError({
                message: `Selected inventory (${formatAmount(selectedRedemptionTotalRaw, product.decimals, product.symbol)}) exceeds your redeemable balance (${formatAmount(product.userAvailableBalanceRaw, product.decimals, product.symbol)}). Select fewer or smaller veNFTs.`,
              });
            }
            return true;
          }
          const parsed = value ? parseAmountRaw(value, product.decimals) : null;
          if (parsed === null || parsed <= 0n) {
            return this.createError({ message: "Enter a valid redemption amount." });
          }
          if (parsed > product.userAvailableBalanceRaw) {
            return this.createError({
              message: `Amount exceeds your redeemable balance (${formatAmount(product.userAvailableBalanceRaw, product.decimals, product.symbol)}).`,
            });
          }
          return true;
        }),
      redemptionKeys: Yup.array(Yup.string().required()).min(1, "Select at least one veNFT."),
    }),
    onSubmit: async () => transactionRef.current?.run(),
  });

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
          <InfoTile
            label="ID20 Balance"
            value={formatAmount(product.id20BalanceRaw, product.decimals, product.symbol)}
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

        {product.id20Address && id20Abi ? (
          <Id20ExitPanel
            product={product}
            id20Abi={id20Abi}
            unwrapAmount={unwrapAmount}
            setUnwrapAmount={setUnwrapAmount}
            transactionRef={unwrapTransactionRef}
            onSuccess={onSuccess}
            onError={onError}
          />
        ) : null}

        <details className="group rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Redemption</p>
                <p className="text-xs text-white/45">
                  {isActionWindowOpen
                    ? isExpired
                      ? "Tranche expired"
                      : "Redemption window open"
                    : "Waiting for weekly settlement window"}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="text-white/45 transition group-open:rotate-45 group-open:text-white"
              >
                +
              </span>
            </div>
          </summary>

          <form onSubmit={formik.handleSubmit} noValidate className="pt-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={actionControlId} className="text-sm font-medium text-white">
                Redemption amount
              </label>
              <span className="text-xs text-white/45">
                Selected{" "}
                {formatAmount(selectedRedemptionTotalRaw, product.decimals, product.symbol)}
              </span>
            </div>

            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white">Select veNFTs to redeem</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {product.redeemInventory.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/45 sm:col-span-2">
                    No vault inventory available for redemption yet.
                  </div>
                ) : (
                  product.redeemInventory.map((position) => {
                    const selected = selectedRedemptionKeysResolved.includes(position.key);
                    const aloneExceedsBalance =
                      product.variant === "veMEZO" &&
                      position.lockedAmountRaw > product.userAvailableBalanceRaw;

                    return (
                      <label
                        key={position.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition",
                          selected
                            ? "border-[var(--accent)]/50 bg-[rgba(196,160,106,0.08)] text-white"
                            : "border-white/10 bg-[#080c12]/60 text-white/70 hover:border-white/20",
                          aloneExceedsBalance && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[var(--accent)]"
                          checked={selected}
                          disabled={!isActionWindowOpen}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...selectedRedemptionKeys, position.key]
                              : selectedRedemptionKeys.filter((key) => key !== position.key);
                            setSelectedRedemptionKeys(next);
                            void formik.setFieldValue("redemptionKeys", next);
                          }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-white">#{position.tokenId.toString()}</p>
                          <p className="text-xs text-white/45">
                            {formatAmount(position.lockedAmountRaw, product.decimals, copy.asset)}
                            {aloneExceedsBalance ? " · exceeds your balance" : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              {mezoInventoryExceedsBalance ? (
                <p role="alert" className="text-xs text-red-200">
                  Selected inventory exceeds your redeemable{" "}
                  {formatAmount(
                    product.userAvailableBalanceRaw,
                    product.decimals,
                    product.symbol,
                  )}
                  . Uncheck larger veNFTs so the selected total fits your balance
                  {(() => {
                    const fit = product.redeemInventory.find(
                      (item) => item.lockedAmountRaw <= product.userAvailableBalanceRaw,
                    );
                    return fit ? ` (e.g. #${fit.tokenId.toString()} alone).` : ".";
                  })()}
                </p>
              ) : null}
            </div>

            {product.variant === "veMEZO" ? (
              <div className="space-y-2 pt-3">
                <Input
                  id={actionControlId}
                  name="amount"
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
              <div className="space-y-2 pt-3">
                <div className="flex gap-2">
                  <Input
                    id={actionControlId}
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onBlur={formik.handleBlur}
                    onChange={(event) => {
                      setWithdrawAmount(event.target.value);
                      void formik.setFieldValue("amount", event.target.value);
                    }}
                    disabled={!isActionWindowOpen}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const max = formatUnits(product.userAvailableBalanceRaw, product.decimals);
                      setWithdrawAmount(max);
                      void formik.setFieldValue("amount", max);
                    }}
                    disabled={!isActionWindowOpen}
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
          {formik.submitCount > 0 && typeof formik.errors.redemptionKeys === "string" ? (
            <p role="alert" className="mt-2 text-xs text-red-200">{formik.errors.redemptionKeys}</p>
          ) : null}
          {formik.touched.amount && formik.errors.amount ? (
            <p role="alert" className="mt-2 text-xs text-red-200">{formik.errors.amount}</p>
          ) : null}
          <TransactionFlowButton
            ref={transactionRef}
            type="submit"
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
            {isActionWindowOpen ? actionLabel : actionUnavailableLabel}
          </TransactionFlowButton>
          {!isSettlementWindowOpen ? (
            <p className="text-xs text-amber-100/80">
              Redemptions are only available during the weekly settlement window, which opens 10
              hours into each epoch and lasts 6 hours.
            </p>
          ) : null}
          </form>
        </details>
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

function Id20ExitPanel({
  product,
  id20Abi,
  unwrapAmount,
  setUnwrapAmount,
  transactionRef,
  onSuccess,
  onError,
}: {
  product: EarnProduct;
  id20Abi: Abi;
  unwrapAmount: string;
  setUnwrapAmount: (value: string) => void;
  transactionRef: React.RefObject<TransactionFlowButtonHandle | null>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const id20Address = product.id20Address;
  const gauges = useId20GaugePositions(chainId, address);
  const gaugePosition = useMemo(
    () =>
      gauges.positions.find(
        (position) =>
          product.id20Address !== null &&
          position.id20Address.toLowerCase() === product.id20Address.toLowerCase(),
      ) ?? null,
    [gauges.positions, product.id20Address],
  );
  const gaugeClaimableRaw = gaugePosition?.claimableRaw ?? 0n;
  const parsedUnwrap = parseAmountRaw(unwrapAmount, product.decimals);
  const canUnwrap =
    Boolean(id20Address) &&
    parsedUnwrap !== null &&
    parsedUnwrap > 0n &&
    parsedUnwrap <= product.id20BalanceRaw;

  const formik = useFormik({
    initialValues: { amount: unwrapAmount },
    enableReinitialize: true,
    validationSchema: Yup.object({
      amount: Yup.string()
        .required("Enter an amount.")
        .test("valid-unwrap", function validateUnwrap(value) {
          const parsed = value ? parseAmountRaw(value, product.decimals) : null;
          if (parsed === null || parsed <= 0n) {
            return this.createError({ message: "Enter a valid unwrap amount." });
          }
          if (parsed > product.id20BalanceRaw) {
            return this.createError({
              message: `Amount exceeds your ID20 balance (${formatAmount(product.id20BalanceRaw, product.decimals, product.symbol)}).`,
            });
          }
          return true;
        }),
    }),
    onSubmit: async () => transactionRef.current?.run(),
  });

  if (!id20Address) return null;

  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Exit ID20 to tranche</p>
            <p className="text-xs text-white/45">
              Unwrap liquid {product.symbol} ID20 back to ERC-1155 tranche units (1:1).
            </p>
          </div>
          <span
            aria-hidden="true"
            className="text-white/45 transition group-open:rotate-45 group-open:text-white"
          >
            +
          </span>
        </div>
      </summary>

      <form onSubmit={formik.handleSubmit} noValidate className="space-y-3 pt-3">
        <div className="flex items-center justify-between gap-3 text-xs text-white/45">
          <span>ID20 balance</span>
          <span className="tabular-nums text-white/70">
            {formatAmount(product.id20BalanceRaw, product.decimals, product.symbol)}
          </span>
        </div>
        {gaugeClaimableRaw > 0n ? (
          <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            Unclaimed ID20 gauge rewards (
            {formatAmount(gaugeClaimableRaw, product.decimals, product.symbol)}) will be claimed
            before unwrap so they are not left stranded after exit.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={`unwrap-amount-${product.id}`}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={unwrapAmount}
            onBlur={formik.handleBlur}
            onChange={(event) => {
              setUnwrapAmount(event.target.value);
              void formik.setFieldValue("amount", event.target.value);
            }}
            disabled={product.id20BalanceRaw <= 0n}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const max = formatUnits(product.id20BalanceRaw, product.decimals);
              setUnwrapAmount(max);
              void formik.setFieldValue("amount", max);
            }}
            disabled={product.id20BalanceRaw <= 0n}
          >
            Max
          </Button>
        </div>
        {formik.touched.amount && formik.errors.amount ? (
          <p role="alert" className="text-xs text-red-200">
            {formik.errors.amount}
          </p>
        ) : null}
        <TransactionFlowButton
          ref={transactionRef}
          type="submit"
          className="w-full"
          variant="secondary"
          disabled={!canUnwrap}
          steps={({ account }) => {
            if (!id20Address || !parsedUnwrap || parsedUnwrap <= 0n) return [];
            const steps: TxStep[] = [];
            // Claim gauge rewards first when present so exit does not leave unclaimed rewards behind.
            if (gaugePosition && gaugePosition.isActive && gaugePosition.claimableRaw > 0n) {
              steps.push(makeId20GaugeClaimStep(gaugePosition, account, true) as unknown as TxStep);
            }
            steps.push(
              makeAddressWriteStep({
                key: "unwrap-id20",
                label: "Exit to tranche",
                displayLabelBtn: true,
                address: id20Address,
                abi: id20Abi,
                variables: {
                  functionName: "unwrap",
                  args: [parsedUnwrap, account],
                },
              }) as unknown as TxStep,
            );
            return steps;
          }}
          onComplete={() => {
            setUnwrapAmount("");
            void formik.setFieldValue("amount", "");
            onSuccess(
              gaugeClaimableRaw > 0n
                ? `${product.symbol} gauge rewards claimed and ID20 unwrapped to ERC-1155 tranche.`
                : `${product.symbol} unwrapped to ERC-1155 tranche.`,
            );
          }}
          onError={txError(onError)}
        >
          {product.id20BalanceRaw <= 0n
            ? "No ID20 balance"
            : gaugeClaimableRaw > 0n
              ? "Claim rewards & exit"
              : "Exit to tranche"}
        </TransactionFlowButton>
      </form>
    </details>
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

function resolveSettlementWindowOpen(product: EarnProduct, blockchainNow: bigint | null): boolean {
  if (blockchainNow === null) return product.isSettlementWindowOpen;
  const epochStart = (blockchainNow / WEEK_SECONDS) * WEEK_SECONDS;
  const epochElapsed = blockchainNow - epochStart;
  return (
    epochElapsed >= SETTLEMENT_WINDOW_START_SECONDS &&
    epochElapsed < SETTLEMENT_WINDOW_START_SECONDS + SETTLEMENT_WINDOW_DURATION_SECONDS
  );
}

function isTrancheExpired(product: EarnProduct, blockchainNow: bigint | null): boolean {
  if (blockchainNow !== null) {
    return product.redeemInventory.some(
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
