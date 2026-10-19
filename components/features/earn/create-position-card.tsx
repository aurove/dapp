"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Layers3,
  LockKeyhole,
  Loader2,
} from "lucide-react";
import { formatUnits, type Address } from "viem";
import { Card, CardContent, CardHeader, CardTitle, Input, cn } from "@ui";
import { FeatureStatusPanel } from "@/components/features/shared/page-shell";
import TransactionFlowButton, {
  type TransactionFlowButtonHandle,
} from "@/lib/tx-flow/TransactionFlowButton";
import {
  makeContractWriteStep,
  makeTokenApprovalStep,
  permanentVeNftUnlockSteps,
  type TxStep,
} from "@/lib/tx-flow";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import { useUserVeNFTs, type UserVeNft } from "@/components/features/earn/hooks/use-user-ve-nfts";
import { earnAssetFromVariant, earnStakePath, type CreatePositionMode } from "./earn-asset";
import { type EarnVariant, useEarnSnapshot } from "./use-earn-data";
import { MAX_EPOCHS_BY_VARIANT, symbolOf } from "./utils/tranche";
import { txError } from "./utils/tx-error";

function amountFromBalancePercent(balance: bigint, percent: number, decimals: number): string {
  if (balance <= 0n || percent <= 0) return "";
  const boundedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  return formatUnits((balance * BigInt(boundedPercent)) / 100n, decimals);
}

function variantCopy(variant: EarnVariant) {
  return variant === "veBTC"
    ? {
        headline: "BTC-backed fungible Earn products",
        asset: "BTC",
        tone: "border-amber-300/25 bg-amber-300/10 text-amber-900 dark:text-amber-100",
      }
    : {
        headline: "MEZO-backed fungible Earn products",
        asset: "MEZO",
        tone: "border-sky-300/25 bg-sky-300/10 text-sky-800 dark:text-sky-100",
      };
}

function getTokenIconPath(variant: EarnVariant) {
  return variant === "veBTC" ? "/tokens/BTC.png" : "/tokens/MEZO.png";
}

export function CreatePositionCard({
  variant,
  createMode,
}: {
  variant: EarnVariant;
  createMode: CreatePositionMode;
}) {
  const { assetLedger, tokens, error, refresh } = useEarnSnapshot();
  const {
    veCollections,
    isLoading: veNftsLoading,
    isFetching: veNftsFetching,
    error: veNftsError,
    refresh: refreshVeNfts,
  } = useUserVeNFTs();

  const [amountByVariant, setAmountByVariant] = useState<Record<EarnVariant, string>>({
    veBTC: "",
    veMEZO: "",
  });
  const [selectedVeNftKeyByVariant, setSelectedVeNftKeyByVariant] = useState<
    Record<EarnVariant, string>
  >({
    veBTC: "",
    veMEZO: "",
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amount = amountByVariant[variant];
  const selectedVeNftKey = selectedVeNftKeyByVariant[variant];
  const setAmount = (value: string) =>
    setAmountByVariant((current) => ({ ...current, [variant]: value }));
  const setSelectedVeNftKey = (value: string) =>
    setSelectedVeNftKeyByVariant((current) => ({ ...current, [variant]: value }));

  const selectedToken = tokens[variant];
  const parsedCreateAmount = selectedToken ? parseAmountRaw(amount, selectedToken.decimals) : null;
  const createEpochs = MAX_EPOCHS_BY_VARIANT[variant];
  const availableVeNfts = useMemo(
    () => veCollections.flatMap((collection) => collection.veNfts),
    [veCollections],
  );
  const availableVeNftsForVariant = useMemo(
    () => availableVeNfts.filter((veNft) => veNft.assetType === variant),
    [availableVeNfts, variant],
  );
  const selectedVeNft = useMemo(
    () =>
      availableVeNftsForVariant.find(
        (veNft) => `${veNft.contractAddress}-${veNft.tokenId.toString()}` === selectedVeNftKey,
      ) ?? null,
    [availableVeNftsForVariant, selectedVeNftKey],
  );

  const createDisabledReason = !selectedToken?.underlyingAddress
    ? "This token is not available on this network."
    : !parsedCreateAmount
      ? "Enter an amount to continue."
      : parsedCreateAmount > selectedToken.balanceRaw
        ? "Not enough balance for this amount."
        : null;

  const depositVeNftDisabledReason = !assetLedger?.address
    ? "Position deposits are unavailable on this network."
    : availableVeNftsForVariant.length === 0
      ? `No ${variant} positions were found in your wallet.`
      : !selectedVeNft
        ? "Select a position to continue."
        : null;

  const createSteps = (account: Address): TxStep[] => {
    if (!assetLedger?.address || !selectedToken?.underlyingAddress || !parsedCreateAmount) {
      throw new Error("Create position inputs are incomplete.");
    }

    const steps: TxStep[] = [
      makeTokenApprovalStep({
        key: "approve-underlying",
        label: `Approve ${selectedToken.symbol}`,
        displayLabelBtn: true,
        approval: {
          standard: "erc20",
          token: selectedToken.underlyingAddress,
          spender: assetLedger.address,
          amount: parsedCreateAmount,
        },
      }),
    ];

    steps.push(
      makeContractWriteStep({
        key: "deposit-erc20",
        label: "Create a liquid position",
        displayLabelBtn: true,
        contractName: "Ledger",
        variables: {
          functionName: "depositErc20",
          args: [variant === "veBTC" ? 1 : 2, BigInt(createEpochs), parsedCreateAmount, account],
        },
      }) as unknown as TxStep,
    );

    return steps;
  };

  const depositVeNftSteps = (account: Address): TxStep[] => {
    if (!assetLedger?.address || !selectedVeNft) {
      throw new Error("veNFT deposit inputs are incomplete.");
    }

    return [
      ...permanentVeNftUnlockSteps([selectedVeNft]),
      makeTokenApprovalStep({
        key: "approve-venft",
        label: "Approve veNFT",
        displayLabelBtn: true,
        approval: {
          standard: "erc721",
          token: selectedVeNft.contractAddress,
          operator: assetLedger.address,
          scope: { kind: "token", tokenId: selectedVeNft.tokenId },
        },
      }),
      makeContractWriteStep({
        key: "deposit-venft",
        label: "Deposit position",
        displayLabelBtn: true,
        contractName: "Ledger",
        variables: {
          functionName: "depositVeNft",
          args: [variant === "veBTC" ? 1 : 2, BigInt(createEpochs), selectedVeNft.tokenId, account],
        },
      }) as unknown as TxStep,
    ];
  };

  const handleSuccess = () => {
    setAmount("");
    if (createMode === "venft") {
      setSelectedVeNftKey("");
    }
    setSuccessMessage(
      createMode === "erc20"
        ? `Your ${createEpochs}-epoch ${variant === "veBTC" ? "BTC" : "MEZO"} position is live.`
        : `Your ${createEpochs}-epoch position is live.`,
    );
    setErrorMessage(null);
    refresh();
    refreshVeNfts();
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  return (
    <div className="space-y-4">
      {successMessage ? (
        <FeatureStatusPanel tone="success" title="Transaction complete" message={successMessage} />
      ) : null}
      {errorMessage ? (
        <FeatureStatusPanel tone="error" title="Transaction failed" message={errorMessage} />
      ) : null}
      {error ? (
        <FeatureStatusPanel tone="error" title="Read error" message={error.message} />
      ) : null}
      <CreatePositionForm
        createMode={createMode}
        variant={variant}
        createEpochs={createEpochs}
        amount={amount}
        setAmount={setAmount}
        selectedVeNftKey={selectedVeNftKey}
        setSelectedVeNftKey={setSelectedVeNftKey}
        availableVeNfts={availableVeNftsForVariant}
        selectedVeNft={selectedVeNft}
        veNftsLoading={veNftsLoading}
        veNftsFetching={veNftsFetching}
        veNftsError={veNftsError}
        selectedToken={selectedToken}
        disabledReason={createMode === "erc20" ? createDisabledReason : depositVeNftDisabledReason}
        createSteps={createMode === "erc20" ? createSteps : depositVeNftSteps}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
}

function CreatePositionForm({
  createMode,
  variant,
  createEpochs,
  amount,
  setAmount,
  selectedVeNftKey,
  setSelectedVeNftKey,
  availableVeNfts,
  selectedVeNft,
  veNftsLoading,
  veNftsFetching,
  veNftsError,
  selectedToken,
  disabledReason,
  createSteps,
  onSuccess,
  onError,
}: {
  createMode: CreatePositionMode;
  variant: EarnVariant;
  createEpochs: number;
  amount: string;
  setAmount: (amount: string) => void;
  selectedVeNftKey: string;
  setSelectedVeNftKey: (value: string) => void;
  availableVeNfts: UserVeNft[];
  selectedVeNft: UserVeNft | null;
  veNftsLoading: boolean;
  veNftsFetching: boolean;
  veNftsError: Error | null;
  selectedToken: ReturnType<typeof useEarnSnapshot>["tokens"][EarnVariant];
  disabledReason: string | null;
  createSteps: (account: Address) => TxStep[];
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const transactionRef = useRef<TransactionFlowButtonHandle>(null);
  const copy = variantCopy(variant);
  const cardDescription =
    "Lock BTC or MEZO to receive a liquid asset that keeps earning. If you already have a Mezo Earn position, you can deposit that instead.";
  const parsedAmount = selectedToken ? parseAmountRaw(amount, selectedToken.decimals) : null;
  const balancePercent =
    selectedToken?.balanceRaw && selectedToken.balanceRaw > 0n && parsedAmount
      ? Math.min(100, Number((parsedAmount * 100n) / selectedToken.balanceRaw))
      : 0;
  const isAmountEntered = Boolean(parsedAmount && parsedAmount > 0n);
  const isBalanceIssue = Boolean(
    disabledReason?.toLowerCase().includes("insufficient wallet balance"),
  );
  const receiveSymbol = symbolOf(variant, createEpochs);
  const receiveAmountRaw =
    createMode === "venft" && selectedVeNft ? selectedVeNft.lockAmountRaw : (parsedAmount ?? 0n);
  const receiveAmountDecimals = createMode === "venft" ? 18 : (selectedToken?.decimals ?? 18);
  const receiveAmount = formatCompactRawTokenAmount(receiveAmountRaw, receiveAmountDecimals, "");
  const ctaLabel =
    createMode === "erc20"
      ? isAmountEntered
        ? "Create a liquid position"
        : "Continue"
      : "Deposit position";

  const handleBalancePercentChange = (percent: number) => {
    setAmount(
      amountFromBalancePercent(
        selectedToken?.balanceRaw ?? 0n,
        percent,
        selectedToken?.decimals ?? 18,
      ),
    );
  };

  const selectedVeNftOptions = availableVeNfts.filter((veNft) => veNft.assetType === variant);
  const validationSchema = useMemo(
    () =>
      Yup.object({
        amount:
          createMode === "erc20"
            ? Yup.string()
                .required("Enter an amount.")
                .test("valid-amount", "Enter a valid amount.", (value) =>
                  Boolean(
                    selectedToken &&
                    value &&
                    (parseAmountRaw(value, selectedToken.decimals) ?? 0n) > 0n,
                  ),
                )
                .test("balance", "Amount exceeds your wallet balance.", (value) => {
                  if (!selectedToken || !value) return false;
                  const parsed = parseAmountRaw(value, selectedToken.decimals);
                  return parsed !== null && parsed <= selectedToken.balanceRaw;
                })
            : Yup.string(),
        selectedVeNftKey:
          createMode === "venft" ? Yup.string().required("Select a position.") : Yup.string(),
      }),
    [createMode, selectedToken],
  );
  const formik = useFormik({
    initialValues: { amount, selectedVeNftKey },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async () => transactionRef.current?.run(),
  });

  return (
    <Card className="relative overflow-hidden border border-foreground/12 shadow-[var(--shadow)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,128,194,0.1),transparent_32%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_42%,transparent),transparent)]"
      />

      <CardHeader className="relative space-y-4 border-b border-foreground/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/12 text-[var(--accent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl sm:text-[1.35rem]">Create Position</CardTitle>
            </div>
          </div>

          <button
            type="button"
            title={cardDescription}
            aria-label={cardDescription}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/12 bg-foreground/[0.03] text-foreground/55 transition hover:border-[var(--accent)]/40 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div
          className="grid grid-cols-2 gap-2 rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-1.5"
          role="tablist"
          aria-label="Create position mode"
        >
          {[
            { value: "venft" as const, label: "Deposit position", icon: Layers3 },
            { value: "erc20" as const, label: "Lock tokens", icon: LockKeyhole },
          ].map((option) => {
            const Icon = option.icon;
            const selected = createMode === option.value;

            return (
              <Link
                key={option.value}
                href={earnStakePath(earnAssetFromVariant(variant), option.value)}
                scroll={false}
                role="tab"
                aria-selected={selected}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  selected
                    ? "border-[var(--accent)]/60 bg-[var(--accent)]/12 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                    : "border-transparent bg-transparent text-foreground/68 hover:border-foreground/10 hover:bg-foreground/[0.03]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{option.label}</span>
              </Link>
            );
          })}
        </div>
      </CardHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <CardContent className="relative space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2" aria-label="Earning asset">
            {(["veBTC", "veMEZO"] as EarnVariant[]).map((option) => {
              const selected = variant === option;
              const label = option === "veBTC" ? "BTC" : "MEZO";
              return (
                <Link
                  key={option}
                  href={earnStakePath(earnAssetFromVariant(option), createMode)}
                  scroll={false}
                  aria-current={selected ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    selected
                      ? "border-[var(--accent)]/70 bg-[var(--accent)]/14 text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
                      : "border-foreground/10 bg-foreground/[0.02] text-foreground/72 hover:border-foreground/15 hover:bg-foreground/[0.05]",
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                    <Image
                      src={getTokenIconPath(option)}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 object-contain"
                      aria-hidden="true"
                    />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {createMode === "erc20" ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor="earn-amount" className="font-medium text-foreground">
                    Amount
                  </label>
                  <span className="text-foreground/45">
                    Balance{" "}
                    {formatCompactRawTokenAmount(
                      selectedToken?.balanceRaw ?? 0n,
                      selectedToken?.decimals ?? 18,
                      selectedToken?.symbol,
                    )}
                  </span>
                </div>
                <Input
                  id="earn-amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder={`0.00 ${selectedToken?.symbol ?? copy.asset}`}
                  value={amount}
                  onBlur={formik.handleBlur}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    void formik.setFieldValue("amount", event.target.value);
                  }}
                  className={cn(
                    "h-14 rounded-2xl px-4 text-2xl font-semibold tracking-tight",
                    isBalanceIssue &&
                      "border-red-500/60 bg-red-500/[0.05] focus-visible:ring-red-400/70",
                  )}
                />
                {formik.touched.amount && formik.errors.amount ? (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-200">
                    {formik.errors.amount}
                  </p>
                ) : null}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-foreground/45">
                    <span>Use balance</span>
                    <span>{balancePercent}%</span>
                  </div>
                  <input
                    aria-label="Percentage of wallet balance"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={balancePercent}
                    onChange={(event) => {
                      handleBalancePercentChange(Number(event.target.value));
                      const nextAmount = amountFromBalancePercent(
                        selectedToken?.balanceRaw ?? 0n,
                        Number(event.target.value),
                        selectedToken?.decimals ?? 18,
                      );
                      void formik.setFieldValue("amount", nextAmount);
                    }}
                    className="w-full accent-[#d9b06c]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="earn-venft" className="font-medium text-foreground">
                  Existing position
                </label>
                <span className="text-foreground/45">
                  {veNftsLoading || veNftsFetching
                    ? "Loading..."
                    : `${selectedVeNftOptions.length} available`}
                </span>
              </div>
              <select
                id="earn-venft"
                name="selectedVeNftKey"
                value={selectedVeNftKey}
                onBlur={formik.handleBlur}
                onChange={(event) => {
                  setSelectedVeNftKey(event.target.value);
                  void formik.setFieldValue("selectedVeNftKey", event.target.value);
                }}
                className="h-12 w-full rounded-2xl border border-foreground/10 bg-panel px-3 text-sm text-foreground outline-none transition focus:border-[var(--accent)]"
              >
                <option value="">Select position</option>
                {selectedVeNftOptions.map((veNft) => {
                  const key = `${veNft.contractAddress}-${veNft.tokenId.toString()}`;

                  return (
                    <option key={key} value={key}>
                      {veNft.assetType} #{veNft.tokenId.toString()} -{" "}
                      {veNft.availableFractionCapacityFormatted}
                    </option>
                  );
                })}
              </select>
              {formik.touched.selectedVeNftKey && formik.errors.selectedVeNftKey ? (
                <p role="alert" className="text-xs text-red-700 dark:text-red-200">
                  {formik.errors.selectedVeNftKey}
                </p>
              ) : null}
              {selectedVeNft ? (
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-foreground/50">Lock amount</span>
                    <span className="font-medium text-foreground">
                      {selectedVeNft.lockAmountFormatted} {copy.asset}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-foreground/50">Lock end</span>
                    <span className="font-medium text-foreground">{selectedVeNft.lockEndLabel}</span>
                  </div>
                </div>
              ) : null}
              {selectedVeNft?.isPermanent ? (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This permanent position will be unlocked before deposit.</span>
                </div>
              ) : null}
              {veNftsError ? (
                <p className="text-sm text-amber-900/80 dark:text-amber-100/80">Could not load existing positions.</p>
              ) : null}
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">You will receive</span>
              <span className="text-foreground/45">{receiveSymbol}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-foreground/10 bg-foreground/[0.04] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10">
                  <Image
                    src="/tokens/Aurove.png"
                    alt={`Aurove ${copy.asset} token`}
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{`Aurove ${copy.asset}`}</p>
                  <p className="text-xs text-foreground/45">
                    1 {copy.asset} = 1 {receiveSymbol}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold text-foreground">{receiveAmount}</p>
              </div>
            </div>
          </div>

          <TransactionFlowButton
            ref={transactionRef}
            type="submit"
            className="h-14 w-full justify-center rounded-2xl bg-[linear-gradient(180deg,#f1c46e,#d8a94f)] px-5 text-base font-semibold text-[#17130c] shadow-[0_16px_30px_rgba(216,169,79,0.22)] hover:bg-[linear-gradient(180deg,#f4ce84,#ddb45d)]"
            size="lg"
            icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            renderStatusIcon={(state) => {
              if (state === "pending") {
                return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
              }
              if (state === "success") {
                return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
              }
              if (state === "error") {
                return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
              }
              return null;
            }}
            steps={({ account }) => createSteps(account)}
            disabled={Boolean(disabledReason)}
            onComplete={onSuccess}
            onError={txError(onError)}
          >
            {ctaLabel}
          </TransactionFlowButton>
        </CardContent>
      </form>
    </Card>
  );
}
