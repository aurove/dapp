"use client";

import { useMemo, useState } from "react";
import { erc20Abi, type Abi, type Address } from "viem";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Coins,
  Gauge,
  Gift,
  Layers3,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Timer,
  Wallet,
} from "lucide-react";
import { Badge } from "@fractals/ui/ui/badge";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { Input } from "@fractals/ui/ui/input";
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

function formatApr(value: number | null): string {
  if (value === null) return "Variable";
  if (value > 999) return ">999%";
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function txErrorMessage(value: unknown, fallback = "Transaction failed."): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getVaultKey(vault: EarnVault): string {
  return vault.address.toLowerCase();
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Gauge;
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

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="min-w-0 text-right font-medium text-[var(--foreground)]">{value}</span>
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
  const amountRaw = selectedAsset
    ? parsePositiveTokenAmount(amount, selectedAsset.underlyingDecimals)
    : null;
  const approvalRequired = Boolean(
    amountRaw && selectedAsset && selectedAsset.allowanceRaw < amountRaw,
  );

  const validationError = useMemo(() => {
    if (!isConnected) return "Connect a wallet to deposit.";
    if (!isCorrectNetwork) return `Switch to ${expectedChainName}.`;
    if (!assetLedgerAddress) return "AssetLedger is not configured for this network.";
    if (!selectedAsset) return "No earn asset is configured.";
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
        label: "Check deposit",
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
        label: `Deposit ${selectedAsset.underlyingSymbol}`,
        contractName: "AssetLedger",
        variables: {
          functionName: "mintFractionsFromErc20",
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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-[var(--accent-soft)]" />
          <CardTitle className="text-lg">Deposit</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {assetOptions.length > 0 ? (
            assetOptions.map((asset) => (
              <button
                key={asset.id}
                type="button"
                disabled={!asset.enabled}
                onClick={() => setSelectedAssetId(asset.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  selectedAsset?.id === asset.id
                    ? "bg-white/10 text-white"
                    : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {asset.label}
              </button>
            ))
          ) : (
            <div className="col-span-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)]">
              No assets configured
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {DEFAULT_TRANCHE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTrancheNumber(option)}
              className={`rounded-lg px-2 py-2 text-sm font-medium transition ${
                trancheNumber === option
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {option}w
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span>Amount</span>
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

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
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
            label="Allowance"
            value={
              selectedAsset
                ? `${formatRawTokenAmount(
                    selectedAsset.allowanceRaw,
                    selectedAsset.underlyingDecimals,
                  )} ${selectedAsset.underlyingSymbol}`
                : "-"
            }
          />
          <SummaryRow
            label="Output"
            value={selectedAsset ? `${selectedAsset.label} fractions` : "-"}
          />
        </div>

        {approvalRequired ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Approval will run before the deposit.
          </div>
        ) : null}

        {validationError && isConnected ? (
          <p className="text-xs text-amber-100">{validationError}</p>
        ) : null}

        <TransactionFlowButton
          steps={depositSteps}
          disabled={depositSteps.length === 0 || Boolean(validationError)}
          onComplete={() => {
            setAmount("");
            onStatus({ type: "success", message: "Deposit confirmed." });
            onComplete();
          }}
          onError={(message) => {
            onStatus({ type: "error", message: txErrorMessage(message, "Deposit failed.") });
          }}
          renderStatusIcon={(state) =>
            state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
          }
        >
          Deposit
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
  children: React.ReactNode;
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
}: {
  assetFractionAbi?: Abi;
  onComplete: () => void;
  onStatus: (status: UiStatus | null) => void;
  userAddress?: Address;
  vault: EarnVault;
  withdrawValue: string;
  onWithdrawValueChange: (value: string) => void;
}) {
  const withdrawableRaw = vault.withdrawableBalanceRaw ?? 0n;
  const withdrawAmountRaw = parsePositiveTokenAmount(withdrawValue, vault.decimals);
  const maxWithdrawRaw = minBigint(withdrawableRaw, vault.userBalanceRaw);
  const withdrawError = !userAddress
    ? "Connect wallet"
    : vault.lifecycle !== "settlement"
      ? "Outside settlement"
      : maxWithdrawRaw <= 0n
        ? "No withdrawable balance"
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
    if (!assetFractionAbi || !userAddress || !withdrawAmountRaw || withdrawError) return [];
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
      makeAddressWriteStep({
        key: `withdraw-${vault.address}`,
        label: `Redeem ${vault.symbol}`,
        address: vault.address,
        abi: assetFractionAbi,
        variables: {
          functionName: "withdrawFractions",
          args: [withdrawAmountRaw, userAddress] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [
    assetFractionAbi,
    userAddress,
    vault.address,
    vault.symbol,
    withdrawAmountRaw,
    withdrawError,
  ]);

  const settleTokenIds =
    vault.expiredHeldTokenIds.length > 0 ? vault.expiredHeldTokenIds : vault.heldTokenIds;
  const settleSteps = useMemo<TxStep[]>(() => {
    if (!assetFractionAbi || settleTokenIds.length === 0 || vault.lifecycle !== "settlement") {
      return [];
    }
    return [
      makeAddressWriteStep({
        key: `settle-${vault.address}`,
        label: `Settle ${vault.symbol}`,
        address: vault.address,
        abi: assetFractionAbi,
        variables: {
          functionName: "settleExpired",
          args: [settleTokenIds] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [assetFractionAbi, settleTokenIds, vault.address, vault.lifecycle, vault.symbol]);

  const relockTokenIds = vault.expiredHeldTokenIds.length > 0 ? vault.expiredHeldTokenIds : [];
  const relockSteps = useMemo<TxStep[]>(() => {
    const canRelock =
      assetFractionAbi &&
      vault.lifecycle === "rolled" &&
      (vault.heldTokenIds.length > 0 || vault.settledUnderlyingRaw > 0n);
    if (!canRelock) return [];
    return [
      makeAddressWriteStep({
        key: `relock-${vault.address}`,
        label: `Rollover ${vault.symbol}`,
        address: vault.address,
        abi: assetFractionAbi,
        variables: {
          functionName: "relock",
          args: [relockTokenIds] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [
    assetFractionAbi,
    relockTokenIds,
    vault.address,
    vault.heldTokenIds.length,
    vault.lifecycle,
    vault.settledUnderlyingRaw,
    vault.symbol,
  ]);

  const lifecycleClass =
    vault.lifecycle === "settlement"
      ? "border-amber-400/35 bg-amber-500/10 text-amber-100"
      : vault.lifecycle === "rolled"
        ? "border-sky-400/35 bg-sky-500/10 text-sky-100"
        : "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{vault.symbol}</CardTitle>
              <span className={`rounded-full border px-2 py-1 text-[10px] ${lifecycleClass}`}>
                {lifecycleLabel(vault.lifecycle)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{vault.name}</p>
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Total supply</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatRawTokenAmount(vault.totalSupplyRaw, vault.decimals)} {vault.symbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">My balance</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatRawTokenAmount(vault.userBalanceRaw, vault.decimals)} {vault.symbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Claimable</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatRawTokenAmount(vault.claimableRewardsRaw, vault.rewardDecimals)}{" "}
              {vault.rewardSymbol}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-xs text-[var(--muted)]">Settlement</p>
            <p className="mt-2 font-semibold text-[var(--foreground)]">
              {formatDateTime(vault.targetEnd)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <SummaryRow
              label="Settled"
              value={
                vault.settledBalanceRaw === null
                  ? "-"
                  : `${formatRawTokenAmount(vault.settledBalanceRaw, vault.decimals)} ${
                      vault.symbol
                    }`
              }
            />
            <SummaryRow
              label="Unsettled"
              value={
                vault.unsettledBalanceRaw === null
                  ? "-"
                  : `${formatRawTokenAmount(vault.unsettledBalanceRaw, vault.decimals)} ${
                      vault.symbol
                    }`
              }
            />
            <SummaryRow
              label="Reserve"
              value={`${formatRawTokenAmount(vault.settledUnderlyingRaw, vault.decimals)} ${
                vault.rewardSymbol
              }`}
            />
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <SummaryRow
              label="Held veNFTs"
              value={`${vault.heldCount.toString()} (${vault.expiredHeldTokenIds.length} expired)`}
            />
            <SummaryRow
              label="Reward reserve"
              value={`${formatRawTokenAmount(vault.rewardReserveRaw, vault.rewardDecimals)} ${
                vault.rewardSymbol
              }`}
            />
            <SummaryRow
              label="Target"
              value={
                vault.targetEnd
                  ? formatDurationFromNow(vault.targetEnd, Math.floor(Date.now() / 1000))
                  : "-"
              }
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
            {withdrawError && withdrawValue ? (
              <p className="text-xs text-amber-100">{withdrawError}</p>
            ) : null}
          </div>
        </div>

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
            steps={settleSteps}
            disabled={settleSteps.length === 0}
            onComplete={() => {
              onStatus({ type: "success", message: `${vault.symbol} settlement updated.` });
              onComplete();
            }}
            onError={(message) => onStatus({ type: "error", message })}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Settle
          </VaultActionButton>

          <VaultActionButton
            steps={relockSteps}
            disabled={relockSteps.length === 0}
            onComplete={() => {
              onStatus({ type: "success", message: `${vault.symbol} rolled forward.` });
              onComplete();
            }}
            onError={(message) => onStatus({ type: "error", message })}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Rollover
          </VaultActionButton>
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

  const connectedStatus = !earn.isConnected
    ? { type: "info" as const, message: "Connect a wallet to view balances and transact." }
    : !earn.isCorrectNetwork
      ? {
          type: "error" as const,
          message: `Switch to ${earn.activeChain.name} to use Earn actions.`,
        }
      : null;

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <Badge className="w-fit">Earn</Badge>
              <CardTitle className="max-w-3xl text-2xl sm:text-3xl">
                Optimised yield routing for fractional ve exposure.
              </CardTitle>
              <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                Deposit supported assets into tranche vaults, track rewards, settle expired backing,
                and redeem during settlement windows.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={earn.refresh} disabled={earn.isFetching}>
              <RefreshCcw className={`h-3.5 w-3.5 ${earn.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Layers3}
          label="Vaults"
          value={earn.portfolioSummary.vaultCount.toString()}
          detail={`${earn.portfolioSummary.positionCount} with wallet balance`}
        />
        <MetricCard
          icon={Gauge}
          label="Top Virtual APR"
          value={formatApr(topApr)}
          detail="Based on reward rate and vault supply"
        />
        <MetricCard
          icon={Gift}
          label="Claimable"
          value={earn.portfolioSummary.claimableCount.toString()}
          detail="Vaults with funded rewards"
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

      <StatusBanner status={connectedStatus ?? status} />
      {earn.error ? <StatusBanner status={{ type: "error", message: earn.error.message }} /> : null}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
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
              <CardTitle className="text-lg">Portfolio</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <SummaryRow
              label="Connected account"
              value={earn.userAddress ? formatAddress(earn.userAddress) : "-"}
            />
            <SummaryRow label="Network" value={earn.activeChain.name} />
            <SummaryRow label="Claimable vaults" value={earn.portfolioSummary.claimableCount} />
            <SummaryRow label="Redeemable vaults" value={earn.portfolioSummary.withdrawableCount} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              {userVaults.length > 0 ? "My Earn Positions" : "Earn Vaults"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {userVaults.length > 0
                ? "Wallet balances and available actions from live contracts."
                : "Live vaults discovered through AssetLedger."}
            </p>
          </div>
        </div>

        {earn.isLoading ? (
          <LoadingVaults />
        ) : visibleVaults.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <Layers3 className="h-5 w-5 text-[var(--accent-soft)]" />
              <div>
                <p className="font-medium text-[var(--foreground)]">No vaults deployed</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  AssetLedger has no registered fraction vaults on this network.
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
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
