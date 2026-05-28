"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CheckCircle2, Coins, LockKeyhole, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { erc20Abi, erc721Abi, formatUnits, parseUnits, type Address } from "viem";
import { useChainId } from "wagmi";
import { Badge } from "@fractals/ui/ui/badge";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { Input } from "@fractals/ui/ui/input";
import { Skeleton } from "@fractals/ui/ui/skeleton";
import { cn } from "@fractals/ui/lib/cn";
import { appRoutes } from "@/components/app/app-nav";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { useChainTime } from "@/lib/web3/use-chain-time";
import { formatRawTokenAmount } from "@/components/features/trade/helpers/formatters";
import { deriveTrancheId } from "@/components/features/trade/utils/tranche";
import { useUserVeNFTs, type UserVeNft } from "@/components/features/trade/hooks/use-user-ve-nfts";
import { type EarnProduct, type EarnVariant, useAprBasis, useEarnData } from "./use-earn-data";
import { EarnPositionCard } from "./earn-position-card";
import { getContractConfig } from "@/contracts/client";

const QUICK_DURATIONS = [4, 13, 26, 52];
const VEBTC_DURATIONS = [1, 2, 3, 4];
const MAX_TRANCHE_WEEKS = 208;
const MAX_VEBTC_TRANCHE_WEEKS = 4;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

type ClaimableSummary = {
  key: string;
  amountRaw: bigint;
  symbol: string;
  decimals: number;
  trancheCount: number;
  products: EarnProduct[];
};

type CreatePositionMode = "erc20" | "venft";
type TrancheAprEstimate = {
  product: EarnProduct;
  aprPercent: number;
};

function formatAmount(value: bigint | null | undefined, decimals = 18, symbol?: string | null) {
  if (value === null || value === undefined) return "Unavailable";
  return formatRawTokenAmount(value, decimals, symbol ?? undefined);
}

function formatAprPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not estimated";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return (
    new Intl.NumberFormat("en-US", {
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

export function EarnPage() {
  const { chainTimestamp } = useChainTime();
  const {
    assetLedger,
    products,
    liveProductCount,
    userPositions,
    tokens,
    isLoading,
    isFetching,
    error,
    refresh,
  } = useEarnData();
  const {
    veCollections,
    isLoading: veNftsLoading,
    isFetching: veNftsFetching,
    error: veNftsError,
    refresh: refreshVeNfts,
  } = useUserVeNFTs();

  const [variant, setVariant] = useState<EarnVariant>("veBTC");
  const [createMode, setCreateMode] = useState<CreatePositionMode>("erc20");
  const [trancheWeeks, setTrancheWeeks] = useState(13);
  const [amount, setAmount] = useState("");
  const [selectedVeNftKey, setSelectedVeNftKey] = useState("");
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedToken = tokens[variant];
  const parsedCreateAmount = selectedToken
    ? parseAmountInput(amount, selectedToken.decimals)
    : null;
  const selectedTrancheId = useMemo(
    () => deriveTrancheId(variant, trancheWeeks),
    [trancheWeeks, variant],
  );
  const matchingProduct = useMemo(
    () => products.find((product) => product.trancheId === selectedTrancheId),
    [products],
  );
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
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;
  const aprQuery = useAprBasis({
    enabled: true,
    products: products,
    chainId,
    assetFractionAbi,
  });
  const aprBasisMap = aprQuery.data ?? {};
  const bestAprEstimate = useMemo(() => {
    return products
      .map((product) => {
        const aprBasis = aprBasisMap[product.fractionAddress.toLowerCase()];

        return estimateTrancheApr({
          ...product,
          aprRewardAmountRaw: aprBasis?.rewardAmountRaw ?? null,
          aprTotalSupplyAtFundingRaw: aprBasis?.totalSupplyAtFundingRaw ?? null,
          aprFundingBlockNumber: aprBasis?.fundingBlockNumber ?? null,
        });
      })
      .filter((estimate): estimate is TrancheAprEstimate => Boolean(estimate))
      .sort((a, b) => b.aprPercent - a.aprPercent)[0];
  }, [products, aprBasisMap]);

  const createDisabledReason = !selectedToken?.underlyingAddress
    ? "Underlying token unavailable for this network."
    : !parsedCreateAmount
      ? "Enter an amount to lock."
      : parsedCreateAmount > selectedToken.balanceRaw
        ? "Insufficient wallet balance."
        : null;

  const depositVeNftDisabledReason = !assetLedger?.address
    ? "AssetLedger unavailable for this network."
    : availableVeNftsForVariant.length === 0
      ? `No ${variant} veNFTs found in your wallet.`
      : !selectedVeNft
        ? "Choose a veNFT to deposit."
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
        label: "Deposit veNFT",
        displayLabelBtn: true,
        contractName: "AssetLedger",
        variables: {
          functionName: "depositVeNft",
          args: [selectedVeNft.contractAddress, selectedVeNft.tokenId, account],
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
                Mezo Earn, simplified
              </Badge>
              <Badge className="border-white/15 bg-white/[0.04] text-white/70">
                Fungible Earn products
              </Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Mezo Earn, simplified into fungible yield products.
              </h1>
              <p className="text-base leading-7 text-white/68 md:text-lg">
                Fractals turns complex veBTC / veMEZO positions, gauges, lock durations, boosts,
                rewards, and incentive routing into simple fungible Earn products users can
                understand, trade, and use.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <HeroMetric label="Live products" value={liveProductCount.toString()} />
            <HeroMetric label="Your claim positions" value={userPositions.length.toString()} />
            <HeroMetric
              label="APR source"
              value={formatAprPercent(bestAprEstimate?.aprPercent)}
              detail={bestAprEstimate?.product.symbol ?? "No funded tranches"}
              subtle={!bestAprEstimate}
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
            products={products}
            assetLedger={assetLedger}
            onSuccess={(message) => handleSuccess(message)}
            onError={handleError}
          />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Your Fraction Positions</h2>
              <p className="mt-1 text-sm text-white/55">
                Swipe through wallet-held fraction positions, track target epoch progress, and
                redeem underlying when a settlement window opens.
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
            setVariant={setVariant}
            trancheWeeks={trancheWeeks}
            setTrancheWeeks={setTrancheWeeks}
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
            matchingProduct={matchingProduct}
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
                  ? "Your liquid lock claim position was created."
                  : "Your veNFT was deposited and fractionalized.",
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
  products,
  assetLedger,
  onSuccess,
  onError,
}: {
  summaries: ClaimableSummary[];
  products: EarnProduct[];
  assetLedger: ReturnType<typeof useEarnData>["assetLedger"];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const totalTranches = products.length;

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
                  {formatAmount(summary.amountRaw, summary.decimals, summary.symbol)}
                </p>
                <ClaimableTokenButton
                  summary={summary}
                  assetLedger={assetLedger}
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
  assetLedger,
  onSuccess,
  onError,
}: {
  summary: ClaimableSummary;
  assetLedger: ReturnType<typeof useEarnData>["assetLedger"];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const activeChainId = useChainId();
  const trancheIds = useMemo(
    () => [...new Set(summary.products.map((product) => product.trancheId))],
    [summary.products],
  );

  const isDisabled = !assetLedger?.address || !assetLedger.abi || summary.products.length === 0;

  return (
    <ConnectButton.Custom>
      {({ account, chain: walletChain, openChainModal, openConnectModal, mounted }) => {
        const connected = Boolean(mounted && account && walletChain);
        const wrongNetwork = Boolean(
          connected && (walletChain?.unsupported || walletChain?.id !== activeChainId),
        );
        if (!connected) {
          return (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={openConnectModal}
            >
              Connect Wallet
            </Button>
          );
        }

        if (wrongNetwork) {
          return (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={openChainModal}
            >
              Wrong network
            </Button>
          );
        }

        return (
          <TransactionFlowButton
            className="w-full"
            size="sm"
            variant="secondary"
            disabled={isDisabled}
            steps={({ account: connectedAccount }) => [
              makeContractWriteStep({
                key: `claim-${summary.key}`,
                label: `Claim ${summary.symbol}`,
                displayLabelBtn: true,
                contractName: "AssetLedger",
                variables: {
                  functionName: "claimRewards",
                  args: [trancheIds, connectedAccount],
                },
              }) as unknown as TxStep,
            ]}
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
      }}
    </ConnectButton.Custom>
  );
}

function CreatePositionCard({
  createMode,
  setCreateMode,
  variant,
  setVariant,
  trancheWeeks,
  setTrancheWeeks,
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
  matchingProduct,
  disabledReason,
  createSteps,
  onSuccess,
  onError,
}: {
  createMode: CreatePositionMode;
  setCreateMode: (mode: CreatePositionMode) => void;
  variant: EarnVariant;
  setVariant: (variant: EarnVariant) => void;
  trancheWeeks: number;
  setTrancheWeeks: (weeks: number) => void;
  amount: string;
  setAmount: (amount: string) => void;
  selectedVeNftKey: string;
  setSelectedVeNftKey: (value: string) => void;
  availableVeNfts: UserVeNft[];
  selectedVeNft: UserVeNft | null;
  veNftsLoading: boolean;
  veNftsFetching: boolean;
  veNftsError: Error | null;
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
          Lock ERC20 or deposit an existing veNFT through AssetLedger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1">
          {[
            { value: "erc20", label: "Lock ERC20" },
            { value: "venft", label: "Deposit veNFT" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCreateMode(option.value as CreatePositionMode)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition",
                createMode === option.value && "bg-white/10 text-white shadow-inner",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

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

        {createMode === "erc20" ? (
          <>
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
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="earn-venft" className="font-medium text-white">
                veNFT
              </label>
              <span className="text-white/45">
                {veNftsLoading || veNftsFetching ? "Loading..." : `${availableVeNfts.length} found`}
              </span>
            </div>
            <select
              id="earn-venft"
              value={selectedVeNftKey}
              onChange={(event) => setSelectedVeNftKey(event.target.value)}
              className="h-11 w-full rounded-lg border border-white/10 bg-[#101820] px-3 text-sm text-white outline-none transition focus:border-[var(--accent)]"
            >
              <option value="">Select veNFT</option>
              {availableVeNfts
                .filter((veNft) => veNft.assetType === variant)
                .map((veNft) => {
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
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm">
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
              <p className="text-sm text-amber-100/80">Could not load veNFT positions.</p>
            ) : null}
          </div>
        )}

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
          {createMode === "erc20" ? "Create liquid lock" : "Deposit veNFT"}
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
          Create a position from supported BTC or MEZO assets, or buy Earn units on the{" "}
          <Link
            href={appRoutes.find((route) => route.label === "Markets")?.href ?? "/app/trade"}
            className="font-medium text-[var(--accent-soft)] underline-offset-4 hover:underline"
          >
            Markets page
          </Link>{" "}
          when markets are available.
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
