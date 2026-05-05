"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { CheckCircle2, LockKeyhole, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { erc20Abi, formatUnits, parseUnits, type Abi, type Address } from "viem";
import { Badge } from "@fractals/ui/ui/badge";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { Input } from "@fractals/ui/ui/input";
import { Skeleton } from "@fractals/ui/ui/skeleton";
import { cn } from "@fractals/ui/lib/cn";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatRawTokenAmount } from "@/components/features/trade/helpers/formatters";
import { deriveTrancheId } from "@/components/features/trade/utils/tranche";
import { lifecycleLabel, type EarnProduct, type EarnVariant, useEarnData } from "./use-earn-data";

const QUICK_DURATIONS = [4, 13, 26, 52];
const VEBTC_DURATIONS = [1, 2, 3, 4];
const MAX_TRANCHE_WEEKS = 208;
const MAX_VEBTC_TRANCHE_WEEKS = 4;

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
  if (value === null || value === undefined) return "Unavailable";
  return formatRawTokenAmount(value, decimals, symbol ?? undefined);
}

function parseAmountInput(amount: string, decimals: number): bigint | null {
  try {
    if (!amount.trim()) return null;
    const parsed = parseUnits(amount.trim(), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

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
        headline: "BTC-backed liquid lock claims",
        asset: "BTC",
        tone: "border-amber-300/25 bg-amber-300/10 text-amber-100",
      }
    : {
        headline: "MEZO-backed liquid lock claims",
        asset: "MEZO",
        tone: "border-sky-300/25 bg-sky-300/10 text-sky-100",
      };
}

function productLifecycleTone(product: EarnProduct) {
  if (product.isRolloverAvailable) return "border-violet-300/25 bg-violet-400/10 text-violet-100";
  if (product.isTargetSettlementWindow)
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  return "border-white/15 bg-white/[0.04] text-white/75";
}

export function EarnPage() {
  const {
    assetLedger,
    assetFractionAbi,
    products,
    liveProductCount,
    userPositions,
    tokens,
    isLoading,
    isFetching,
    error,
    refresh,
  } = useEarnData();

  const [variant, setVariant] = useState<EarnVariant>("veBTC");
  const [trancheWeeks, setTrancheWeeks] = useState(13);
  const [amount, setAmount] = useState("");
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedToken = tokens[variant];
  const parsedCreateAmount = selectedToken
    ? parseAmountInput(amount, selectedToken.decimals)
    : null;
  const selectedTrancheId = useMemo(
    () => deriveTrancheId(variant, trancheWeeks),
    [variant, trancheWeeks],
  );
  const matchingProduct = products.find((product) => product.trancheId === selectedTrancheId);

  const createDisabledReason = !selectedToken?.underlyingAddress
    ? "Underlying token unavailable for this network."
    : !parsedCreateAmount
      ? "Enter an amount to lock."
      : parsedCreateAmount > selectedToken.balanceRaw
        ? "Insufficient wallet balance."
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
        contractName: "AssetLedger",
        variables: {
          functionName: "depositErc20",
          args: [selectedToken.veNftAddress, BigInt(trancheWeeks), parsedCreateAmount, account],
        },
      }) as unknown as TxStep,
    );

    return steps;
  };

  const handleSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    refresh();
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
                Mezo Earn, simplified
              </Badge>
              <Badge className="border-white/15 bg-white/[0.04] text-white/70">
                ERC1155 liquid lock claims
              </Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Mezo Earn, simplified into fungible yield products.
              </h1>
              <p className="text-base leading-7 text-white/68 md:text-lg">
                Fractals turns complex veBTC / veMEZO positions, gauges, lock durations, boosts,
                rewards, and incentive routing into simple Earn products users can understand,
                trade, claim from, and redeem.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeroMetric label="Live products" value={liveProductCount.toString()} />
            <HeroMetric label="Your claim positions" value={userPositions.length.toString()} />
            <HeroMetric label="APR source" value="Not estimated" subtle />
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Earn Products</h2>
              <p className="mt-1 text-sm text-white/55">
                Backed by configured AssetFraction controllers. APRs are intentionally omitted until
                the contracts expose dependable live yield data.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <ProductSkeleton />
          ) : (
            <div className="grid gap-4 lg:grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  live={liveProductCount > 0}
                  assetFractionAbi={assetFractionAbi}
                  onRolloverSuccess={() =>
                    handleSuccess(`${product.symbol} rolled into its next cycle.`)
                  }
                  onError={handleError}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <CreatePositionCard
            variant={variant}
            setVariant={setVariant}
            trancheWeeks={trancheWeeks}
            setTrancheWeeks={setTrancheWeeks}
            amount={amount}
            setAmount={setAmount}
            selectedToken={selectedToken}
            matchingProduct={matchingProduct}
            disabledReason={createDisabledReason}
            createSteps={createSteps}
            onSuccess={() => {
              setAmount("");
              handleSuccess("Your liquid lock claim position was created.");
            }}
            onError={handleError}
          />
        </aside>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Your Positions</h2>
          <p className="mt-1 text-sm text-white/55">
            Wallet balances, reward claims, and maturity actions are read directly from the ledger
            and AssetFraction contracts.
          </p>
        </div>

        {isLoading ? (
          <ProductSkeleton />
        ) : userPositions.length === 0 ? (
          <EmptyPositions />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {userPositions.map((position) => (
              <PositionCard
                key={position.id}
                product={position}
                withdrawAmount={withdrawAmounts[position.id] ?? ""}
                setWithdrawAmount={(value) =>
                  setWithdrawAmounts((prev) => ({ ...prev, [position.id]: value }))
                }
                assetFractionAbi={assetFractionAbi}
                onSuccess={(message) => handleSuccess(message)}
                onError={handleError}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HeroMetric({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className="rounded-xl border border-white/12 bg-white/[0.035] p-4">
      <p className="text-xs font-medium uppercase text-white/45">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", subtle ? "text-white/70" : "text-white")}>
        {value}
      </p>
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

function ProductCard({
  product,
  live,
  assetFractionAbi,
  onRolloverSuccess,
  onError,
}: {
  product: EarnProduct;
  live: boolean;
  assetFractionAbi: Abi | undefined;
  onRolloverSuccess: () => void;
  onError: (message: string) => void;
}) {
  const copy = variantCopy(product.variant);

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge className={copy.tone}>{copy.headline}</Badge>
            <CardTitle className="mt-3 text-lg">{product.symbol}</CardTitle>
            <CardDescription>{product.name}</CardDescription>
          </div>
          <Badge className={productLifecycleTone(product)}>
            {lifecycleLabel(product.lifecycle)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile
            label="Lock duration"
            value={formatDuration(product.trancheDuration, product.trancheNumber)}
          />
          <InfoTile label="Maturity" value={formatDate(product.targetEpochEnd)} />
          <InfoTile
            label="Total claims"
            value={formatAmount(product.totalSupplyRaw, 18, product.symbol)}
          />
          <InfoTile
            label="Reward reserve"
            value={formatAmount(
              product.rewardReserveRaw,
              product.rewardDecimals,
              product.rewardSymbol,
            )}
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm leading-6 text-white/62">
          {live
            ? "This product is registered in AssetLedger and backed by managed veNFT custody."
            : "No live fraction exists yet for this starter card. Creating a position uses AssetLedger.depositErc20 and can deploy the tranche if supported by the contracts."}
        </div>

        {product.isRolloverAvailable &&
        product.fractionAddress !== "0x0000000000000000000000000000000000000000" ? (
          <TransactionFlowButton
            size="sm"
            variant="secondary"
            steps={[
              makeAddressWriteStep({
                key: "rollover",
                label: "Rollover",
                displayLabelBtn: true,
                address: product.fractionAddress,
                abi: assetFractionAbi ?? ([] as unknown as Abi),
                variables: { functionName: "rollover" },
              }) as unknown as TxStep,
            ]}
            onComplete={onRolloverSuccess}
            onError={txError(onError)}
          >
            Rollover tranche
          </TransactionFlowButton>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CreatePositionCard({
  variant,
  setVariant,
  trancheWeeks,
  setTrancheWeeks,
  amount,
  setAmount,
  selectedToken,
  matchingProduct,
  disabledReason,
  createSteps,
  onSuccess,
  onError,
}: {
  variant: EarnVariant;
  setVariant: (variant: EarnVariant) => void;
  trancheWeeks: number;
  setTrancheWeeks: (weeks: number) => void;
  amount: string;
  setAmount: (amount: string) => void;
  selectedToken: ReturnType<typeof useEarnData>["tokens"][EarnVariant];
  matchingProduct?: EarnProduct;
  disabledReason: string | null;
  createSteps: (account: Address) => TxStep[];
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const copy = variantCopy(variant);
  const durationOptions = variant === "veBTC" ? VEBTC_DURATIONS : QUICK_DURATIONS;
  const maxTrancheWeeks = variant === "veBTC" ? MAX_VEBTC_TRANCHE_WEEKS : MAX_TRANCHE_WEEKS;
  const parsedAmount = selectedToken ? parseAmountInput(amount, selectedToken.decimals) : null;
  const balancePercent =
    selectedToken?.balanceRaw && selectedToken.balanceRaw > 0n && parsedAmount
      ? Math.min(100, Number((parsedAmount * 100n) / selectedToken.balanceRaw))
      : 0;

  useEffect(() => {
    if (variant === "veBTC" && trancheWeeks > MAX_VEBTC_TRANCHE_WEEKS) {
      setTrancheWeeks(MAX_VEBTC_TRANCHE_WEEKS);
    }
  }, [setTrancheWeeks, trancheWeeks, variant]);

  const handleVariantChange = (nextVariant: EarnVariant) => {
    setVariant(nextVariant);
    if (nextVariant === "veBTC" && trancheWeeks > MAX_VEBTC_TRANCHE_WEEKS) {
      setTrancheWeeks(MAX_VEBTC_TRANCHE_WEEKS);
    }
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

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LockKeyhole className="h-5 w-5 text-[var(--accent)]" />
          Create Position
        </CardTitle>
        <CardDescription>
          Lock ERC20 through AssetLedger and mint fungible ERC1155 claims to your wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1">
          {(["veBTC", "veMEZO"] as EarnVariant[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleVariantChange(option)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition",
                variant === option && "bg-white/10 text-white shadow-inner",
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <label htmlFor="earn-amount" className="font-medium text-white">
              Amount
            </label>
            <span className="text-white/45">
              Balance{" "}
              {formatAmount(
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
              className="w-full accent-[#c4a06a]"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white">Lock duration</span>
            <span className="text-white/45">{trancheWeeks} weeks</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {durationOptions.map((weeks) => (
              <button
                key={weeks}
                type="button"
                onClick={() => setTrancheWeeks(weeks)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-sm transition",
                  trancheWeeks === weeks
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-white/12 bg-white/[0.03] text-white/65 hover:bg-white/[0.07]",
                )}
              >
                {weeks}w
              </button>
            ))}
          </div>
          <input
            aria-label="Lock duration in weeks"
            type="range"
            min={1}
            max={maxTrancheWeeks}
            step={1}
            value={trancheWeeks}
            onChange={(event) => setTrancheWeeks(Number(event.target.value))}
            className="w-full accent-[#c4a06a]"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-white/50">Claim product</span>
            <span className="font-medium text-white">
              {matchingProduct?.symbol ?? `f${variant}-W${trancheWeeks}`}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/45">
            {matchingProduct
              ? "This tranche already has a registered AssetFraction controller."
              : "The tranche is not currently listed in AssetLedger reads. If supported, depositErc20 can create the fraction on first deposit."}
          </p>
        </div>

        {disabledReason ? <p className="text-sm text-amber-100/80">{disabledReason}</p> : null}

        <TransactionFlowButton
          className="w-full"
          steps={({ account }) => createSteps(account)}
          disabled={Boolean(disabledReason)}
          onComplete={onSuccess}
          onError={txError(onError)}
        >
          Create liquid lock
        </TransactionFlowButton>
      </CardContent>
    </Card>
  );
}

function PositionCard({
  product,
  withdrawAmount,
  setWithdrawAmount,
  assetFractionAbi,
  onSuccess,
  onError,
}: {
  product: EarnProduct;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  assetFractionAbi: Abi | undefined;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const parsedWithdraw = parseAmountInput(withdrawAmount, 18);
  const canWithdraw =
    product.isTargetSettlementWindow &&
    parsedWithdraw !== null &&
    parsedWithdraw <= product.userBalanceRaw &&
    parsedWithdraw > 0n;

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{product.symbol}</CardTitle>
            <CardDescription>{variantCopy(product.variant).headline}</CardDescription>
          </div>
          <Badge className={productLifecycleTone(product)}>
            {lifecycleLabel(product.lifecycle)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile
            label="Your balance"
            value={formatAmount(product.userBalanceRaw, 18, product.symbol)}
          />
          <InfoTile
            label="Claimable rewards"
            value={formatAmount(
              product.claimableRewardsRaw,
              product.rewardDecimals,
              product.rewardSymbol,
            )}
          />
          <InfoTile label="Maturity" value={formatDate(product.targetEpochEnd)} />
          <InfoTile
            label="Settled reserve"
            value={formatAmount(
              product.settledUnderlyingRaw,
              18,
              product.variant.replace("ve", ""),
            )}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <TransactionFlowButton
            variant="secondary"
            size="sm"
            disabled={!assetFractionAbi || product.claimableRewardsRaw === 0n}
            steps={({ account }) => [
              makeAddressWriteStep({
                key: "claim-rewards",
                label: "Claim rewards",
                displayLabelBtn: true,
                address: product.fractionAddress,
                abi: assetFractionAbi ?? ([] as unknown as Abi),
                variables: {
                  functionName: "claimRewards",
                  args: [account],
                },
              }) as unknown as TxStep,
            ]}
            onComplete={() => onSuccess(`Rewards claimed for ${product.symbol}.`)}
            onError={txError(onError)}
          >
            Claim rewards
          </TransactionFlowButton>
          {product.isRolloverAvailable ? (
            <TransactionFlowButton
              variant="secondary"
              size="sm"
              disabled={!assetFractionAbi}
              steps={[
                makeAddressWriteStep({
                  key: "rollover",
                  label: "Rollover",
                  displayLabelBtn: true,
                  address: product.fractionAddress,
                  abi: assetFractionAbi ?? ([] as unknown as Abi),
                  variables: { functionName: "rollover" },
                }) as unknown as TxStep,
              ]}
              onComplete={() => onSuccess(`${product.symbol} rolled into its next cycle.`)}
              onError={txError(onError)}
            >
              Rollover
            </TransactionFlowButton>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`withdraw-${product.id}`} className="text-sm font-medium text-white">
              Redeem at maturity
            </label>
            <span className="text-xs text-white/45">
              {product.isTargetSettlementWindow ? "Window open" : "Unavailable now"}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              id={`withdraw-${product.id}`}
              inputMode="decimal"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(event) => setWithdrawAmount(event.target.value)}
              disabled={!product.isTargetSettlementWindow}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setWithdrawAmount(formatUnits(product.userBalanceRaw, 18))}
              disabled={!product.isTargetSettlementWindow}
            >
              Max
            </Button>
          </div>
          <TransactionFlowButton
            className="w-full"
            variant="secondary"
            disabled={!canWithdraw}
            steps={({ account }) => [
              makeContractWriteStep({
                key: "withdraw",
                label: "Redeem claims",
                displayLabelBtn: true,
                contractName: "AssetLedger",
                variables: {
                  functionName: "withdraw",
                  args: [product.trancheId, parsedWithdraw ?? 0n, account],
                },
              }) as unknown as TxStep,
            ]}
            onComplete={() => {
              setWithdrawAmount("");
              onSuccess(`${product.symbol} claims redeemed.`);
            }}
            onError={txError(onError)}
          >
            Redeem underlying
          </TransactionFlowButton>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <p className="text-xs text-white/42">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function EmptyPositions() {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
      <Wallet className="mx-auto h-8 w-8 text-white/35" />
      <h3 className="mt-3 text-lg font-semibold text-white">No liquid lock claims yet</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/55">
        Create a position from supported BTC or MEZO assets, or buy claim tokens on the Trade page
        when markets are available.
      </p>
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
