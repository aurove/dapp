"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { erc20Abi, formatUnits, type Abi, type Address } from "viem";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coins,
  Gauge,
  Gift,
  Layers3,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  RotateCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@fractals/ui/ui/badge";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { Input } from "@fractals/ui/ui/input";
import { Progress } from "@fractals/ui/ui/progress";
import { Skeleton } from "@fractals/ui/ui/skeleton";
import {
  makeAddressWriteStep,
  makeContractWriteStep,
  TransactionFlowButton,
  type TxStep,
} from "@/lib/tx-flow";
import { formatRawTokenAmount } from "@/components/features/trade/helpers/formatters";
import { useEarnData, type EarnAssetOption, type EarnVault } from "../hooks/use-earn-data";
import {
  DEFAULT_TRANCHE_OPTIONS,
  formatDateTime,
  formatDurationFromNow,
  formatTokenInput,
  lifecycleLabel,
  minBigint,
  parsePositiveTokenAmount,
  type EarnAssetId,
} from "../utils";

type UiStatus = {
  type: "success" | "error" | "info";
  message: string;
};

const PRODUCT_COPY: Record<EarnAssetId, { title: string; description: string; accent: string }> = {
  veBTC: {
    title: "BTC-backed Earn exposure",
    description:
      "Convert supported BTC-side deposits into fungible fveBTC tranches without manually managing veNFT locks.",
    accent: "BTC",
  },
  veMEZO: {
    title: "MEZO boost and incentive exposure",
    description:
      "Access MEZO-aligned lock duration and reward routes as simple fungible Earn positions.",
    accent: "MEZO",
  },
};

function formatApr(value: number | null): string {
  if (value === null) return "Variable";
  if (value > 999) return ">999%";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCompactAmount(value: bigint, decimals: number, symbol: string): string {
  const formatted = Number(formatUnits(value, decimals));
  if (!Number.isFinite(formatted)) return `${formatRawTokenAmount(value, decimals)} ${symbol}`;
  if (formatted === 0) return `0 ${symbol}`;
  if (formatted >= 1_000_000) return `${(formatted / 1_000_000).toFixed(2)}M ${symbol}`;
  if (formatted >= 1_000) return `${(formatted / 1_000).toFixed(2)}K ${symbol}`;
  return `${formatRawTokenAmount(value, decimals)} ${symbol}`;
}

function txErrorMessage(value: unknown, fallback = "Transaction failed."): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getVaultKey(vault: EarnVault): string {
  return vault.address.toLowerCase();
}

function vaultProgress(vault: EarnVault, nowTimestamp: number): number {
  if (!vault.targetEnd || !vault.trancheNumber || vault.trancheNumber <= 0) return 0;
  const duration = vault.trancheNumber * 7 * 24 * 60 * 60;
  const target = Number(vault.targetEnd);
  const start = target - duration;
  if (nowTimestamp <= start) return 0;
  if (nowTimestamp >= target) return 100;
  return Math.max(0, Math.min(100, ((nowTimestamp - start) / duration) * 100));
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
          <Icon className="h-4 w-4 text-[var(--accent-soft)]" />
        </div>
        <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          {value}
        </p>
        {detail ? <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatusBanner({ status }: { status: UiStatus | null }) {
  if (!status) return null;

  const isError = status.type === "error";
  const isSuccess = status.type === "success";
  const Icon = isError ? AlertTriangle : isSuccess ? CheckCircle2 : Wallet;
  const className = isError
    ? "border-red-400/30 bg-red-500/10 text-red-100"
    : isSuccess
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : "border-sky-400/30 bg-sky-500/10 text-sky-100";

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 [overflow-wrap:anywhere]">{status.message}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-medium text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function HowItWorksCard({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
        <Icon className="h-4 w-4 text-[var(--accent-soft)]" />
      </div>
      <p className="mt-4 font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}

function DepositPanel({
  assetLedgerAddress,
  assetOptions,
  expectedChainName,
  isConnected,
  isCorrectNetwork,
  onComplete,
  onStatus,
  userAddress,
}: {
  assetLedgerAddress?: Address;
  assetOptions: EarnAssetOption[];
  expectedChainName: string;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  onComplete: () => void;
  onStatus: (status: UiStatus | null) => void;
  userAddress?: Address;
}) {
  const [selectedAssetId, setSelectedAssetId] = useState<EarnAssetId>("veBTC");
  const [trancheNumber, setTrancheNumber] = useState(12);
  const [amount, setAmount] = useState("");

  const selectedAsset =
    assetOptions.find((asset) => asset.id === selectedAssetId) ?? assetOptions[0] ?? null;
  const selectedCopy = selectedAsset ? PRODUCT_COPY[selectedAsset.id] : null;
  const amountRaw = selectedAsset
    ? parsePositiveTokenAmount(amount, selectedAsset.underlyingDecimals)
    : null;
  const approvalRequired = Boolean(
    amountRaw && selectedAsset && selectedAsset.allowanceRaw < amountRaw,
  );

  const validationError = useMemo(() => {
    if (!isConnected) return "Connect a wallet to create an Earn position.";
    if (!isCorrectNetwork) return `Switch to ${expectedChainName}.`;
    if (!assetLedgerAddress) return "AssetLedger is not configured for this network.";
    if (!selectedAsset) return "No Earn asset is configured.";
    if (!selectedAsset.enabled) return `${selectedAsset.label} deposits are not enabled.`;
    if (!selectedAsset.underlyingToken) return `${selectedAsset.label} token is unavailable.`;
    if (!amountRaw) return "Enter an amount greater than zero.";
    if (selectedAsset.walletBalanceRaw < amountRaw) return "Insufficient wallet balance.";
    return null;
  }, [
    amountRaw,
    assetLedgerAddress,
    expectedChainName,
    isConnected,
    isCorrectNetwork,
    selectedAsset,
  ]);

  const depositSteps = useMemo<TxStep[]>(() => {
    if (!assetLedgerAddress || !selectedAsset?.underlyingToken || !amountRaw || !userAddress) {
      return [];
    }

    return [
      {
        type: "custom",
        key: "deposit-preflight",
        label: "Check Earn deposit",
        run: async () => {
          onStatus(null);
          if (validationError) throw new Error(validationError);
          return "skip";
        },
      },
      makeAddressWriteStep({
        key: "approve-underlying",
        label: `Approve ${selectedAsset.underlyingSymbol}`,
        address: selectedAsset.underlyingToken,
        abi: erc20Abi,
        shouldSkip: async (ctx) => {
          const allowance = (await ctx.publicClient.readContract({
            address: selectedAsset.underlyingToken!,
            abi: erc20Abi,
            functionName: "allowance",
            args: [ctx.account, assetLedgerAddress],
          })) as bigint;
          return allowance >= amountRaw;
        },
        variables: {
          functionName: "approve",
          args: [assetLedgerAddress, amountRaw] as const,
        },
      }) as unknown as TxStep,
      makeContractWriteStep({
        key: "deposit-underlying",
        label: `Mint ${selectedAsset.label} Earn product`,
        contractName: "AssetLedger",
        variables: {
          functionName: "depositErc20",
          args: [selectedAsset.veAddress, BigInt(trancheNumber), amountRaw, userAddress] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [
    amountRaw,
    assetLedgerAddress,
    onStatus,
    selectedAsset,
    trancheNumber,
    userAddress,
    validationError,
  ]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-[var(--accent-soft)]" />
              <CardTitle className="text-lg">Create Earn Position</CardTitle>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Choose the base asset and duration. Fractals mints a fungible product backed by the
              underlying Mezo Earn lock.
            </p>
          </div>
          <Badge className="shrink-0">1-click route</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="grid gap-2 sm:grid-cols-2">
          {assetOptions.length > 0 ? (
            assetOptions.map((asset) => {
              const copy = PRODUCT_COPY[asset.id];
              const active = selectedAsset?.id === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  disabled={!asset.enabled}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    active
                      ? "border-[var(--accent)]/55 bg-[var(--accent)]/10 text-white"
                      : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{asset.label}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--accent-soft)]">
                      {copy.accent}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{copy.title}</p>
                </button>
              );
            })
          ) : (
            <div className="col-span-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-[var(--muted)]">
              No assets configured on this network.
            </div>
          )}
        </div>

        {selectedCopy ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">{selectedCopy.title}.</span>{" "}
            {selectedCopy.description}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Lock duration</p>
              <p className="text-xs text-[var(--muted)]">
                Longer tranches can represent deeper Mezo Earn conviction.
              </p>
            </div>
            <span className="text-xs font-medium text-[var(--accent-soft)]">
              {trancheNumber} weeks
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-1">
            {DEFAULT_TRANCHE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTrancheNumber(option)}
                className={`rounded-xl px-2 py-3 text-sm font-medium transition ${
                  trancheNumber === option
                    ? "bg-white/10 text-white"
                    : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {option}w
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span>Deposit amount</span>
            <button
              type="button"
              className="font-medium text-[var(--accent-soft)] disabled:text-white/30"
              disabled={!selectedAsset || selectedAsset.walletBalanceRaw <= 0n}
              onClick={() => {
                if (!selectedAsset) return;
                setAmount(
                  formatTokenInput(
                    selectedAsset.walletBalanceRaw,
                    selectedAsset.underlyingDecimals,
                  ),
                );
              }}
            >
              Max
            </button>
          </div>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <SummaryRow
            label="Wallet balance"
            value={
              selectedAsset
                ? `${formatRawTokenAmount(
                    selectedAsset.walletBalanceRaw,
                    selectedAsset.underlyingDecimals,
                  )} ${selectedAsset.underlyingSymbol}`
                : "-"
            }
          />
          <SummaryRow
            label="Approval"
            value={approvalRequired ? "Required before deposit" : "Ready"}
          />
          <SummaryRow
            label="You receive"
            value={selectedAsset ? `f${selectedAsset.label}-${trancheNumber}w shares` : "-"}
          />
          <SummaryRow label="Position type" value="Fungible ERC1155 Earn product" />
        </div>

        {validationError && isConnected ? (
          <p className="text-xs text-amber-100">{validationError}</p>
        ) : null}

        <TransactionFlowButton
          steps={depositSteps}
          disabled={depositSteps.length === 0 || Boolean(validationError)}
          className="w-full"
          onComplete={() => {
            setAmount("");
            onStatus({ type: "success", message: "Earn position created." });
            onComplete();
          }}
          onError={(message) => {
            onStatus({ type: "error", message: txErrorMessage(message, "Deposit failed.") });
          }}
          renderStatusIcon={(state) =>
            state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
          }
        >
          Create Earn Position
        </TransactionFlowButton>
      </CardContent>
    </Card>
  );
}

function VaultActionButton({
  children,
  disabled,
  steps,
  onComplete,
  onError,
  variant = "secondary",
}: {
  children: ReactNode;
  disabled?: boolean;
  steps: TxStep[];
  onComplete: () => void;
  onError: (message: string) => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  return (
    <TransactionFlowButton
      steps={steps}
      disabled={disabled || steps.length === 0}
      variant={variant}
      size="sm"
      onComplete={onComplete}
      onError={(message) => onError(txErrorMessage(message))}
      renderStatusIcon={(state) =>
        state === "pending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null
      }
    >
      {children}
    </TransactionFlowButton>
  );
}

function VaultCard({
  assetFractionAbi,
  onComplete,
  onStatus,
  userAddress,
  vault,
  withdrawValue,
  onWithdrawValueChange,
  nowTimestamp,
}: {
  assetFractionAbi?: Abi;
  onComplete: () => void;
  onStatus: (status: UiStatus | null) => void;
  userAddress?: Address;
  vault: EarnVault;
  withdrawValue: string;
  onWithdrawValueChange: (value: string) => void;
  nowTimestamp: number;
}) {
  const withdrawableRaw = vault.withdrawableBalanceRaw ?? 0n;
  const withdrawAmountRaw = parsePositiveTokenAmount(withdrawValue, vault.decimals);
  const maxWithdrawRaw = minBigint(withdrawableRaw, vault.userBalanceRaw);
  const progress = vaultProgress(vault, nowTimestamp);
  const withdrawalReady = vault.lifecycle === "settlement" && maxWithdrawRaw > 0n;
  const withdrawError = !userAddress
    ? "Connect wallet"
    : vault.lifecycle !== "settlement"
      ? "Redeem during settlement"
      : maxWithdrawRaw <= 0n
        ? "No redeemable balance"
        : !withdrawAmountRaw
          ? "Enter amount"
          : withdrawAmountRaw > maxWithdrawRaw
            ? "Above available"
            : null;

  const claimSteps = useMemo<TxStep[]>(() => {
    if (!assetFractionAbi || !userAddress || vault.claimableRewardsRaw <= 0n) return [];
    return [
      makeAddressWriteStep({
        key: `claim-${vault.address}`,
        label: `Claim ${vault.symbol}`,
        address: vault.address,
        abi: assetFractionAbi,
        variables: {
          functionName: "claimRewards",
          args: [userAddress] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [assetFractionAbi, userAddress, vault.address, vault.claimableRewardsRaw, vault.symbol]);

  const withdrawSteps = useMemo<TxStep[]>(() => {
    if (!userAddress || !withdrawAmountRaw || withdrawError) return [];
    return [
      {
        type: "custom",
        key: `withdraw-preflight-${vault.address}`,
        label: "Check redemption",
        run: async () => {
          if (withdrawError) throw new Error(withdrawError);
          return "skip";
        },
      },
      makeContractWriteStep({
        key: `withdraw-${vault.address}`,
        label: `Redeem ${vault.symbol}`,
        contractName: "AssetLedger",
        variables: {
          functionName: "withdraw",
          args: [vault.trancheId, withdrawAmountRaw, userAddress] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [userAddress, vault.address, vault.symbol, vault.trancheId, withdrawAmountRaw, withdrawError]);

  const rolloverSteps = useMemo<TxStep[]>(() => {
    if (!assetFractionAbi || !vault.isRolloverAvailable) return [];
    return [
      makeAddressWriteStep({
        key: `rollover-${vault.address}`,
        label: `Rollover ${vault.symbol}`,
        address: vault.address,
        abi: assetFractionAbi,
        variables: {
          functionName: "rollover",
          args: [] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [assetFractionAbi, vault.address, vault.isRolloverAvailable, vault.symbol]);

  const lifecycleClass =
    vault.lifecycle === "settlement"
      ? "border-amber-400/35 bg-amber-500/10 text-amber-100"
      : vault.lifecycle === "rolled"
        ? "border-sky-400/35 bg-sky-500/10 text-sky-100"
        : "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";

  const productName = vault.assetId
    ? `${PRODUCT_COPY[vault.assetId].accent} ${vault.trancheNumber ?? "?"}w Earn`
    : "Earn Product";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{vault.symbol}</CardTitle>
              <span className={`rounded-full border px-2 py-1 text-[10px] ${lifecycleClass}`}>
                {lifecycleLabel(vault.lifecycle)}
              </span>
              {vault.isRolloverAvailable ? (
                <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100">
                  Rollover ready
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{productName}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-[var(--foreground)]">
              {formatApr(vault.virtualAprPct)}
            </p>
            <p className="text-xs text-[var(--muted)]">Virtual APR</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span>Lock maturity progress</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <Progress className="mt-3" value={progress} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>Target: {formatDateTime(vault.targetEnd)}</span>
            <span>
              {vault.targetEnd
                ? formatDurationFromNow(vault.targetEnd, nowTimestamp)
                : "No active target"}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Total product supply</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatCompactAmount(vault.totalSupplyRaw, vault.decimals, vault.symbol)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">My position</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatCompactAmount(vault.userBalanceRaw, vault.decimals, vault.symbol)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Claimable rewards</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatCompactAmount(
                vault.claimableRewardsRaw,
                vault.rewardDecimals,
                vault.rewardSymbol,
              )}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Reward reserve</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatCompactAmount(
                vault.rewardReserveRaw,
                vault.rewardDecimals,
                vault.rewardSymbol,
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <SummaryRow
              label="Tranche"
              value={vault.trancheNumber ? `${vault.trancheNumber} weeks` : "-"}
            />
            <SummaryRow label="Backing veNFTs" value={`${vault.heldCount.toString()} held`} />
            <SummaryRow label="Expired locks" value={vault.expiredHeldTokenIds.length.toString()} />
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <SummaryRow
              label="Settled balance"
              value={`${formatRawTokenAmount(vault.settledBalanceRaw ?? 0n, vault.decimals)} ${vault.symbol}`}
            />
            <SummaryRow
              label="Unsettled balance"
              value={`${formatRawTokenAmount(vault.unsettledBalanceRaw ?? 0n, vault.decimals)} ${vault.symbol}`}
            />
            <SummaryRow
              label="Underlying reserve"
              value={`${formatRawTokenAmount(vault.settledUnderlyingRaw, vault.decimals)} units`}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
              <span>Redeem amount</span>
              <button
                type="button"
                className="font-medium text-[var(--accent-soft)] disabled:text-white/30"
                disabled={maxWithdrawRaw <= 0n}
                onClick={() =>
                  onWithdrawValueChange(formatTokenInput(maxWithdrawRaw, vault.decimals))
                }
              >
                Max
              </button>
            </div>
            <Input
              value={withdrawValue}
              onChange={(event) => onWithdrawValueChange(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            {withdrawError && (withdrawValue || withdrawalReady) ? (
              <p className="text-xs text-amber-100">{withdrawError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <VaultActionButton
              steps={claimSteps}
              disabled={vault.claimableRewardsRaw <= 0n}
              onComplete={() => {
                onStatus({ type: "success", message: `${vault.symbol} rewards claimed.` });
                onComplete();
              }}
              onError={(message) => onStatus({ type: "error", message })}
            >
              <Gift className="h-3.5 w-3.5" />
              Claim
            </VaultActionButton>

            <VaultActionButton
              steps={withdrawSteps}
              disabled={Boolean(withdrawError)}
              onComplete={() => {
                onWithdrawValueChange("");
                onStatus({ type: "success", message: `${vault.symbol} redeemed.` });
                onComplete();
              }}
              onError={(message) => onStatus({ type: "error", message })}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Redeem
            </VaultActionButton>

            <VaultActionButton
              steps={rolloverSteps}
              disabled={rolloverSteps.length === 0}
              onComplete={() => {
                onStatus({
                  type: "success",
                  message: `${vault.symbol} rolled into the next Earn cycle.`,
                });
                onComplete();
              }}
              onError={(message) => onStatus({ type: "error", message })}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rollover
            </VaultActionButton>
          </div>

          <Button asChild variant="ghost" size="sm">
            <Link href="/app/trade">
              Trade product
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingVaults() {
  return (
    <div className="grid gap-4">
      {[0, 1].map((item) => (
        <Card key={item}>
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3 w-full" />
            <div className="grid gap-3 sm:grid-cols-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EarnPageContent() {
  const earn = useEarnData();
  const [status, setStatus] = useState<UiStatus | null>(null);
  const [withdrawValues, setWithdrawValues] = useState<Record<string, string>>({});

  const topApr = earn.vaults.reduce<number | null>((best, vault) => {
    if (vault.virtualAprPct === null) return best;
    return best === null ? vault.virtualAprPct : Math.max(best, vault.virtualAprPct);
  }, null);

  const userVaults = earn.vaults.filter((vault) => vault.hasUserPosition);
  const visibleVaults = userVaults.length > 0 ? userVaults : earn.vaults;
  const rewardSymbol =
    earn.vaults.find((vault) => vault.rewardReserveRaw > 0n)?.rewardSymbol ?? "rewards";

  const connectedStatus = !earn.isConnected
    ? {
        type: "info" as const,
        message:
          "Connect a wallet to view balances, create Earn positions, claim rewards, and redeem mature tranches.",
      }
    : !earn.isCorrectNetwork
      ? {
          type: "error" as const,
          message: `Switch to ${earn.activeChain.name} to use Earn actions.`,
        }
      : null;

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-[var(--accent)]/25 bg-[radial-gradient(circle_at_top_left,rgba(204,185,143,0.16),transparent_34%),rgba(255,255,255,0.02)]">
        <CardContent className="p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.45fr_0.9fr] lg:items-center">
            <div className="space-y-5">
              <Badge className="w-fit">Fractals Earn</Badge>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
                  Mezo Earn, simplified into fungible yield products.
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  Fractals turns complex veBTC / veMEZO positions, gauges, lock durations, boosts,
                  rewards, and incentive routing into simple Earn products users can understand,
                  trade, claim from, and redeem.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href="#create-earn-position">
                    Create Earn position
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/app/trade">
                    Trade fractions
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="ghost" onClick={earn.refresh} disabled={earn.isFetching}>
                  <RefreshCcw className={`h-4 w-4 ${earn.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                    Current network
                  </p>
                  <p className="mt-1 font-semibold text-[var(--foreground)]">
                    {earn.activeChain.name}
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-[var(--accent-soft)]" />
              </div>
              <div className="mt-5 grid gap-3">
                <SummaryRow
                  label="Connected account"
                  value={earn.userAddress ? formatAddress(earn.userAddress) : "-"}
                />
                <SummaryRow label="Live Earn products" value={earn.portfolioSummary.vaultCount} />
                <SummaryRow label="My positions" value={earn.portfolioSummary.positionCount} />
                <SummaryRow
                  label="Next maturity"
                  value={formatDateTime(earn.portfolioSummary.nextSettlementAt)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Layers3}
          label="Earn products"
          value={earn.portfolioSummary.vaultCount.toString()}
          detail={`${earn.portfolioSummary.activeCount} active, ${earn.portfolioSummary.rolloverCount} rollover-ready`}
        />
        <MetricCard
          icon={Gauge}
          label="Top Virtual APR"
          value={formatApr(topApr)}
          detail="Based on reward rate and live product supply"
        />
        <MetricCard
          icon={Gift}
          label="Claimable routes"
          value={earn.portfolioSummary.claimableCount.toString()}
          detail={`Vaults with claimable ${rewardSymbol}`}
        />
        <MetricCard
          icon={Timer}
          label="Next Settlement"
          value={formatDateTime(earn.portfolioSummary.nextSettlementAt)}
          detail={
            earn.portfolioSummary.nextSettlementAt
              ? formatDurationFromNow(earn.portfolioSummary.nextSettlementAt, earn.blockTimestamp)
              : "No active target"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <HowItWorksCard
          icon={LockKeyhole}
          title="Lock complexity abstracted"
          body="Users choose an Earn product while Fractals routes deposits into supported veBTC or veMEZO lock tranches."
        />
        <HowItWorksCard
          icon={Route}
          title="Gauge and boost context simplified"
          body="The page presents tranche duration, maturity, reward reserve, and claimable rewards without exposing every routing primitive."
        />
        <HowItWorksCard
          icon={Sparkles}
          title="Fungible output"
          body="Instead of managing a single veNFT, users receive ERC1155 fraction shares that represent a simple Earn product."
        />
        <HowItWorksCard
          icon={TrendingUp}
          title="Trade or redeem"
          body="Positions can be used in the Trade flow, claimed from, rolled forward, or redeemed when the settlement lifecycle allows it."
        />
      </div>

      <StatusBanner status={connectedStatus ?? status} />
      {earn.error ? <StatusBanner status={{ type: "error", message: earn.error.message }} /> : null}

      <div id="create-earn-position" className="grid gap-4 lg:grid-cols-[430px_1fr]">
        <DepositPanel
          assetLedgerAddress={earn.assetLedger?.address}
          assetOptions={earn.assetOptions}
          expectedChainName={earn.activeChain.name}
          isConnected={earn.isConnected}
          isCorrectNetwork={earn.isCorrectNetwork}
          onComplete={earn.refresh}
          onStatus={setStatus}
          userAddress={earn.userAddress}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--accent-soft)]" />
              <CardTitle className="text-lg">Portfolio Command Centre</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <SummaryRow
                label="Account"
                value={earn.userAddress ? formatAddress(earn.userAddress) : "-"}
              />
              <SummaryRow label="Network" value={earn.activeChain.name} />
              <SummaryRow label="Earn positions" value={earn.portfolioSummary.positionCount} />
              <SummaryRow label="Redeemable" value={earn.portfolioSummary.withdrawableCount} />
            </div>
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <SummaryRow label="Claimable products" value={earn.portfolioSummary.claimableCount} />
              <SummaryRow label="Rollover-ready" value={earn.portfolioSummary.rolloverCount} />
              <SummaryRow label="Known products" value={earn.portfolioSummary.vaultCount} />
              <SummaryRow
                label="Reward reserve"
                value={formatCompactAmount(
                  earn.portfolioSummary.totalRewardReserveRaw,
                  18,
                  rewardSymbol,
                )}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:col-span-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Product IA</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Fractals presents Mezo Earn as a set of simple, fungible products. Users do not need
                to reason through every veNFT, gauge, lock duration, boost, reward path, or
                incentive route before participating.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              {userVaults.length > 0 ? "My Earn Products" : "Available Earn Products"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {userVaults.length > 0
                ? "Live wallet balances, claimable rewards, maturity status, rollover readiness, and redemption controls."
                : "Products discovered from AssetLedger and displayed through the current contract ABIs."}
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/trade">
              Open Trade
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {earn.isLoading ? (
          <LoadingVaults />
        ) : visibleVaults.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <Layers3 className="h-5 w-5 text-[var(--accent-soft)]" />
              <div>
                <p className="font-medium text-[var(--foreground)]">No Earn products deployed</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  AssetLedger has no registered fraction products on this network yet.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {visibleVaults.map((vault) => (
              <VaultCard
                key={vault.address}
                assetFractionAbi={earn.assetFraction?.abi}
                vault={vault}
                userAddress={earn.userAddress}
                withdrawValue={withdrawValues[getVaultKey(vault)] ?? ""}
                onWithdrawValueChange={(value) =>
                  setWithdrawValues((current) => ({
                    ...current,
                    [getVaultKey(vault)]: value,
                  }))
                }
                onComplete={earn.refresh}
                onStatus={setStatus}
                nowTimestamp={earn.blockTimestamp}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
