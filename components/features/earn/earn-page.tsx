"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState, type SyntheticEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Info,
  Layers3,
  LockKeyhole,
  Loader2,
  RefreshCw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { erc20Abi, erc721Abi, formatUnits, type Abi, type Address } from "viem";
import { useChainId } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@ui";
import { appRoutes } from "@/components/app/app-nav";
import { getEarnProtocolConfig, getRewardSinkAbi } from "@/contracts/earn";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { useChainTime } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import { useUserVeNFTs, type UserVeNft } from "@/components/features/earn/hooks/use-user-ve-nfts";
import { type EarnProduct, type EarnVariant, useApyBasis, useEarnSnapshot } from "./use-earn-data";
import { EarnPositionCard } from "./earn-position-card";
import { MAX_EPOCHS_BY_VARIANT, symbolOf } from "./utils/tranche";

type ClaimableSummary = {
  key: string;
  amountRaw: bigint;
  symbol: string;
  decimals: number;
  trancheCount: number;
  products: EarnProduct[];
};

type CreatePositionMode = "erc20" | "venft";

function amountFromBalancePercent(balance: bigint, percent: number, decimals: number): string {
  if (balance <= 0n || percent <= 0) return "";
  const boundedPercent = Math.min(100, Math.max(0, Math.round(percent)));
  return formatUnits((balance * BigInt(boundedPercent)) / 100n, decimals);
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

function getTokenIconPath(variant: EarnVariant) {
  return variant === "veBTC" ? "/tokens/BTC.png" : "/tokens/MEZO.png";
}

export function EarnPage() {
  const { chainTimestamp } = useChainTime();
  const {
    assetLedger,
    products,
    userPositions,
    tokens,
    isLoading,
    isFetching,
    error,
    refresh,
  } = useEarnSnapshot();
  const {
    veCollections,
    isLoading: veNftsLoading,
    isFetching: veNftsFetching,
    error: veNftsError,
    refresh: refreshVeNfts,
  } = useUserVeNFTs();

  const [variant, setVariant] = useState<EarnVariant>("veBTC");
  const [createMode, setCreateMode] = useState<CreatePositionMode>("erc20");
  const [amount, setAmount] = useState("");
  const [selectedVeNftKey, setSelectedVeNftKey] = useState("");
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const claimableSummaries = useMemo<ClaimableSummary[]>(() => {
    const summaries = new Map<string, ClaimableSummary>();

    products.forEach((product) => {
      if (product.claimableRewardsRaw <= 0n) {
        return;
      }

      const symbol = product.rewardSymbol ?? "Reward";
      const key = product.rewardAsset?.toLowerCase() ?? `${symbol}-${product.rewardDecimals}`;
      const existing = summaries.get(key);

      if (existing) {
        existing.amountRaw += product.claimableRewardsRaw;
        existing.trancheCount += 1;
        existing.products.push(product);
        return;
      }

      summaries.set(key, {
        key,
        amountRaw: product.claimableRewardsRaw,
        symbol,
        decimals: product.rewardDecimals,
        trancheCount: 1,
        products: [product],
      });
    });

    return [...summaries.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [products]);

  const chainId = useChainId();
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const assetFractionAbi = earnContracts.ledger?.abi;
  const rewardSinkAbi = getRewardSinkAbi(chainId);
  const apyQuery = useApyBasis({
    enabled: true,
    products: products,
    chainId,
    assetFractionAbi,
  });
  const apyBasisMap = useMemo(() => apyQuery.data ?? {}, [apyQuery.data]);

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

    const steps: TxStep[] = [];
    if (selectedToken.allowanceRaw < parsedCreateAmount) {
      steps.push(
        makeAddressWriteStep({
          key: "approve-underlying",
          label: `Approve ${selectedToken.symbol}`,
          displayLabelBtn: true,
          address: selectedToken.underlyingAddress,
          abi: erc20Abi,
          variables: {
            functionName: "approve",
            args: [assetLedger.address, parsedCreateAmount],
          },
        }) as unknown as TxStep,
      );
    }

    steps.push(
      makeContractWriteStep({
        key: "deposit-erc20",
        label: "Create liquid lock",
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
      makeAddressWriteStep({
        key: "approve-venft",
        label: "Approve veNFT",
        displayLabelBtn: true,
        address: selectedVeNft.contractAddress,
        abi: erc721Abi,
        variables: {
          functionName: "setApprovalForAll",
          args: [assetLedger.address, true],
        },
      }) as unknown as TxStep,
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

  const handleSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    refresh();
    refreshVeNfts();
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(22,29,36,0.98),rgba(9,13,18,0.94))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] md:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                MEZO EARN, MADE LIQUID
              </Badge>
              <Badge className="border-white/15 bg-white/[0.04] text-white/70">
                LIQUID EARNING ASSETS
              </Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Turn Mezo Earn positions into liquid assets you can use.
              </h1>
              <p className="text-base leading-7 text-white/68 md:text-lg">
                Deposit BTC, MEZO, or an existing locked Mezo Earn position and receive a liquid Aurove
                asset. Keep earning from the underlying position while gaining the flexibility to swap
                when you need liquidty.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeroMetric label="AVAILABLE ASSETS" value="0" />
            <HeroMetric label="YOUR POSITIONS" value="0" />
            <HeroMetric
              label="ESTIMATED YIELD"
              value="Not available yet"
              detail="Yield data will appear when an Aurove asset is live."
              subtle
            />
          </div>
        </div>
      </section>

      {successMessage ? (
        <StatusPanel tone="success" title="Transaction complete" message={successMessage} />
      ) : null}
      {errorMessage ? (
        <StatusPanel tone="error" title="Transaction failed" message={errorMessage} />
      ) : null}
      {error ? <StatusPanel tone="error" title="Read error" message={error.message} /> : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="order-2 min-w-0 space-y-4 lg:order-1">
          <ClaimablesPanel
            summaries={claimableSummaries}
            rewardSinkAbi={rewardSinkAbi}
            onSuccess={(message) => handleSuccess(message)}
            onError={handleError}
          />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Your Fraction Positions</h2>
              <p className="mt-1 text-sm text-white/55">
                Swipe through wallet-held fraction positions, track target epoch progress, and
                redeem underlying when the product window opens.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <ProductSkeleton />
          ) : userPositions.length === 0 ? (
            <EmptyPositions />
          ) : (
            <div className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-1 pr-1">
              {userPositions.map((position) => (
                <div
                  key={position.id}
                  className="w-[min(100%,22rem)] flex-none snap-start sm:w-96 lg:w-[28rem]"
                >
                  <EarnPositionCard
                    product={position}
                    chainTimestamp={chainTimestamp}
                    apyBasisMap={apyBasisMap}
                    withdrawAmount={withdrawAmounts[position.id] ?? ""}
                    setWithdrawAmount={(value) =>
                      setWithdrawAmounts((prev) => ({ ...prev, [position.id]: value }))
                    }
                    onSuccess={(message) => handleSuccess(message)}
                    onError={handleError}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="order-1 min-w-0 space-y-4 lg:order-2">
          <CreatePositionCard
            createMode={createMode}
            setCreateMode={setCreateMode}
            variant={variant}
            createEpochs={createEpochs}
            setVariant={setVariant}
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
            disabledReason={
              createMode === "erc20" ? createDisabledReason : depositVeNftDisabledReason
            }
            createSteps={createMode === "erc20" ? createSteps : depositVeNftSteps}
            onSuccess={() => {
              setAmount("");
              if (createMode === "venft") {
                setSelectedVeNftKey("");
              }
              handleSuccess(
                createMode === "erc20"
                  ? `Your ${createEpochs}-epoch ${variant === "veBTC" ? "BTC" : "MEZO"} position is live.`
                  : `Your ${createEpochs}-epoch position is live.`,
              );
            }}
            onError={handleError}
          />
        </aside>
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  subtle,
}: {
  label: string;
  value: string;
  detail?: string;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.035] p-4">
      <p className="text-xs font-medium uppercase text-white/45">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", subtle ? "text-white/70" : "text-white")}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-white/45">{detail}</p> : null}
    </div>
  );
}

function StatusPanel({
  tone,
  title,
  message,
}: {
  tone: "success" | "error";
  title: string;
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        tone === "success"
          ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
          : "border-red-300/25 bg-red-500/10 text-red-100",
      )}
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
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
  const totalTranches = summaries.reduce((t, c) => c.products.length + t, 0);

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
      [...new Set(summary.products.map((product) => product.rewardSinkAddress).filter(Boolean))]
        .filter((address): address is Address => Boolean(address)),
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
        rewardSinkAddresses.map((rewardSinkAddress, index) =>
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

function CreatePositionCard({
  createMode,
  setCreateMode,
  variant,
  createEpochs,
  setVariant,
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
  setCreateMode: (mode: CreatePositionMode) => void;
  variant: EarnVariant;
  createEpochs: number;
  setVariant: (variant: EarnVariant) => void;
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
  const receiveAmount = formatCompactRawTokenAmount(
    parsedAmount ?? 0n,
    selectedToken?.decimals ?? 18,
    "",
  );
  const ctaLabel =
    createMode === "erc20"
      ? isAmountEntered
        ? "Create liquid lock"
        : "Continue"
      : "Deposit position";

  const handleVariantChange = (nextVariant: EarnVariant) => {
    setVariant(nextVariant);
  };

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

  return (
    <Card className="relative overflow-hidden border border-white/12 bg-[linear-gradient(160deg,rgba(19,24,33,0.98),rgba(10,13,18,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,160,106,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,128,194,0.12),transparent_32%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(234,209,165,0.36),transparent)]"
      />

      <CardHeader className="relative space-y-4 border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/35 bg-[linear-gradient(160deg,rgba(196,160,106,0.16),rgba(196,160,106,0.05))] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/55 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06] hover:text-white"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-1.5">
          {[
            { value: "erc20", label: "Lock tokens", icon: LockKeyhole },
            { value: "venft", label: "Deposit position", icon: Layers3 },
          ].map((option) => {
            const Icon = option.icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setCreateMode(option.value as CreatePositionMode)}
                aria-pressed={createMode === option.value}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition",
                  createMode === option.value
                    ? "border-[var(--accent)]/60 bg-[linear-gradient(180deg,rgba(196,160,106,0.16),rgba(196,160,106,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.03]",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-2">
          {(["veBTC", "veMEZO"] as EarnVariant[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleVariantChange(option)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                variant === option
                  ? "border-[var(--accent)]/70 bg-[linear-gradient(180deg,rgba(196,160,106,0.18),rgba(196,160,106,0.06))] text-white shadow-[0_0_0_1px_rgba(196,160,106,0.12)]"
                  : "border-white/10 bg-white/[0.02] text-white/72 hover:border-white/15 hover:bg-white/[0.05]",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src={getTokenIconPath(option)}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 object-contain"
                />
              </span>
              <span>{option === "veBTC" ? "BTC" : "MEZO"}</span>
            </button>
          ))}
        </div>

        {createMode === "erc20" ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="earn-amount" className="font-medium text-white">
                  Amount
                </label>
                <span className="text-white/45">
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
                inputMode="decimal"
                placeholder={`0.00 ${selectedToken?.symbol ?? copy.asset}`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={cn(
                  "h-14 rounded-2xl px-4 text-2xl font-semibold tracking-tight",
                  isBalanceIssue &&
                  "border-red-500/60 bg-red-500/[0.05] focus-visible:ring-red-400/70",
                )}
              />
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs text-white/45">
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
                  onChange={(event) => handleBalancePercentChange(Number(event.target.value))}
                  className="w-full accent-[#d9b06c]"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="earn-venft" className="font-medium text-white">
                Existing position
              </label>
              <span className="text-white/45">
                {veNftsLoading || veNftsFetching
                  ? "Loading..."
                  : `${selectedVeNftOptions.length} available`}
              </span>
            </div>
            <select
              id="earn-venft"
              value={selectedVeNftKey}
              onChange={(event) => setSelectedVeNftKey(event.target.value)}
              className="h-12 w-full rounded-2xl border border-white/10 bg-[#10161e] px-3 text-sm text-white outline-none transition focus:border-[var(--accent)]"
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
            {selectedVeNft ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/50">Lock amount</span>
                  <span className="font-medium text-white">
                    {selectedVeNft.lockAmountFormatted} {copy.asset}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-white/50">Lock end</span>
                  <span className="font-medium text-white">{selectedVeNft.lockEndLabel}</span>
                </div>
              </div>
            ) : null}
            {veNftsError ? (
              <p className="text-sm text-amber-100/80">Could not load existing positions.</p>
            ) : null}
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-white">You will receive</span>
            <span className="text-white/45">{receiveSymbol}</span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[var(--accent)]/35 bg-[rgba(196,160,106,0.08)]">
                <Image
                  src="/tokens/Aurove.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{`Aurove ${copy.asset}`}</p>
                <p className="text-xs text-white/45">
                  1 {copy.asset} = 1 {receiveSymbol}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-white">{receiveAmount}</p>
            </div>
          </div>
        </div>

        <TransactionFlowButton
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
    </Card>
  );
}

function EmptyPositions() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(145deg,rgba(18,24,32,0.92)_0%,rgba(9,13,19,0.96)_52%,rgba(11,10,8,0.94)_100%)] p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_60px_rgba(0,0,0,0.32)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(196,160,106,0.1),transparent_34%),linear-gradient(245deg,rgba(76,103,138,0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(230,210,173,0.42),transparent)]" />
      <div className="relative mx-auto max-w-3xl rounded-2xl border border-dashed border-white/14 bg-[#070b10]/58 px-6 py-9 shadow-[inset_0_1px_20px_rgba(255,255,255,0.025)] backdrop-blur-sm">
        <Wallet className="mx-auto h-8 w-8 text-white/40" />
        <h3 className="mt-3 text-lg font-semibold text-white">No fungible Earn products yet</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/58">
          Create a position from supported BTC or MEZO assets, or preview liquidity on the{" "}
          <Link
            href={appRoutes.find((route) => route.label === "Swap")?.href ?? "/swap"}
            className="font-medium text-[var(--accent-soft)] underline-offset-4 hover:underline"
          >
            Swap page
          </Link>{" "}
          while swap routing is being prepared.
        </p>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((item) => (
        <Card key={item} className="rounded-xl">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-40" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
