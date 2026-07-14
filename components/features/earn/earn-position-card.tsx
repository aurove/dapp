"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, BadgeCheck, Coins, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { formatUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, cn } from "@ui";
import { AddTokenToWalletButton } from "@/components/shared/add-token-to-wallet-button";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { formatCompactRawTokenAmount, parseAmountRaw, readResult } from "@/lib/web3/value-parsers";
import { veNftCollectionAbi } from "./protocol";
import type { EarnTrancheSnapshot } from "./use-earn-data";

type SettlementWindow = { opensAt: bigint; closesAt: bigint } | null;

type TrancheInventoryToken = {
  tokenId: bigint;
  amountRaw: bigint;
  lockEnd: bigint;
  isPermanent: boolean;
};

type EarnPositionCardProps = {
  tranche: EarnTrancheSnapshot;
  chainId: number;
  chainTimestamp: bigint | null;
  settlementWindow: SettlementWindow;
  isSettlementWindowOpen: boolean;
  onRefresh: () => void;
  onActionSuccess: (message: string) => void;
  onActionError: (message: string) => void;
};

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function parseLockedBalance(value: unknown): TrancheInventoryToken {
  if (!value) {
    return { tokenId: 0n, amountRaw: 0n, lockEnd: 0n, isPermanent: false };
  }

  if (Array.isArray(value)) {
    const amountRaw = toBigInt(value[0]);
    return {
      tokenId: 0n,
      amountRaw: amountRaw > 0n ? amountRaw : 0n,
      lockEnd: toBigInt(value[1]),
      isPermanent: Boolean(value[2]),
    };
  }

  if (typeof value === "object") {
    const payload = value as {
      amount?: unknown;
      end?: unknown;
      isPermanent?: unknown;
    };

    const amountRaw = toBigInt(payload.amount);
    return {
      tokenId: 0n,
      amountRaw: amountRaw > 0n ? amountRaw : 0n,
      lockEnd: toBigInt(payload.end),
      isPermanent: Boolean(payload.isPermanent),
    };
  }

  return { tokenId: 0n, amountRaw: 0n, lockEnd: 0n, isPermanent: false };
}

function shortAddress(address: Address | null | undefined): string {
  if (!address) return "Unavailable";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDateLabel(epochSeconds: bigint): string {
  if (epochSeconds <= 0n) return "Unknown";

  const millis = Number(epochSeconds) * 1000;
  if (!Number.isFinite(millis) || millis <= 0) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(millis));
}

function formatSettlementStatus(
  chainTimestamp: bigint | null,
  settlementWindow: SettlementWindow,
): string {
  if (!settlementWindow) return "Unavailable";

  if (chainTimestamp === null) {
    return `Opens ${formatDateLabel(settlementWindow.opensAt)} and closes ${formatDateLabel(
      settlementWindow.closesAt,
    )}`;
  }

  if (chainTimestamp < settlementWindow.opensAt) {
    return `Opens ${formatDateLabel(settlementWindow.opensAt)}`;
  }

  if (chainTimestamp < settlementWindow.closesAt) {
    return `Open until ${formatDateLabel(settlementWindow.closesAt)}`;
  }

  return `Closed since ${formatDateLabel(settlementWindow.closesAt)}`;
}

function toneClasses(variant: EarnTrancheSnapshot["variant"]): string {
  return variant === "veBTC"
    ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
    : "border-sky-300/25 bg-sky-300/10 text-sky-100";
}

function inventorySelectionClasses(selected: boolean): string {
  return cn(
    "rounded-xl border px-3 py-2 text-left text-sm transition",
    selected
      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white"
      : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white",
  );
}

function pickBtcRedeemTokenIds(tokens: TrancheInventoryToken[], amountRaw: bigint): bigint[] {
  if (amountRaw <= 0n) return [];

  const selected: bigint[] = [];
  let accumulated = 0n;

  for (const token of tokens) {
    if (accumulated >= amountRaw) break;
    selected.push(token.tokenId);
    accumulated += token.amountRaw;
  }

  return accumulated >= amountRaw ? selected : [];
}

export function EarnPositionCard({
  tranche,
  chainId,
  chainTimestamp,
  settlementWindow,
  isSettlementWindowOpen,
  onRefresh,
  onActionSuccess,
  onActionError,
}: EarnPositionCardProps) {
  const { address: userAddress } = useAccount();
  const [wrapAmount, setWrapAmount] = useState("");
  const [unwrapAmount, setUnwrapAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [selectedRedeemIds, setSelectedRedeemIds] = useState<Set<string>>(new Set());

  const inventoryContracts = useMemo(() => {
    if (!tranche.collectionAddress || tranche.vaultTokenIds.length === 0) return [];

    return tranche.vaultTokenIds.map((tokenId) => ({
      address: tranche.collectionAddress as Address,
      abi: veNftCollectionAbi,
      functionName: "locked" as const,
      args: [tokenId] as const,
      chainId,
    }));
  }, [chainId, tranche.collectionAddress, tranche.vaultTokenIds]);

  const inventoryReads = useReadContracts({
    allowFailure: true,
    contracts: inventoryContracts,
    query: {
      enabled: inventoryContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const inventoryTokens = useMemo<TrancheInventoryToken[]>(() => {
    const reads = inventoryReads.data ?? [];

    return tranche.vaultTokenIds.map((tokenId, index) => {
      const parsed = parseLockedBalance(readResult(reads, index));
      return {
        tokenId,
        amountRaw: parsed.amountRaw,
        lockEnd: parsed.lockEnd,
        isPermanent: parsed.isPermanent,
      };
    });
  }, [inventoryReads.data, tranche.vaultTokenIds]);

  const inventoryTotalRaw = useMemo(
    () => inventoryTokens.reduce((sum, token) => sum + token.amountRaw, 0n),
    [inventoryTokens],
  );

  const selectedRedeemIdsArray = useMemo(
    () => [...selectedRedeemIds].filter(Boolean),
    [selectedRedeemIds],
  );

  const selectedRedeemTokens = useMemo(() => {
    if (selectedRedeemIdsArray.length === 0) return [];
    const selected = new Set(selectedRedeemIdsArray);
    return inventoryTokens.filter((token) => selected.has(token.tokenId.toString()));
  }, [inventoryTokens, selectedRedeemIdsArray]);

  const selectedRedeemTotalRaw = useMemo(
    () => selectedRedeemTokens.reduce((sum, token) => sum + token.amountRaw, 0n),
    [selectedRedeemTokens],
  );

  const parsedWrapAmount = parseAmountRaw(wrapAmount, 18);
  const parsedUnwrapAmount = parseAmountRaw(unwrapAmount, 18);
  const parsedRedeemAmount = parseAmountRaw(redeemAmount, 18);

  const wrapperAddress = tranche.wrapperAddress;
  const wrapperGaugeAddress = tranche.wrapperGaugeAddress;
  const wrapperUpstreamClaimableRaw = tranche.wrapperUpstreamClaimableRaw;
  const claimableSinkRaw = tranche.rawRewardClaimableRaw;
  const claimableWrapperRaw = tranche.wrapperClaimableRaw;

  const autoRedeemTokenIds = useMemo(() => {
    if (tranche.assetSymbol !== "BTC" || !parsedRedeemAmount) return [];
    return pickBtcRedeemTokenIds(inventoryTokens, parsedRedeemAmount);
  }, [inventoryTokens, parsedRedeemAmount, tranche.assetSymbol]);

  const canCreateWrapper = Boolean(tranche.id20FactoryAddress) && !wrapperAddress;
  const canHarvestRebases = Boolean(tranche.ledgerAddress);
  const canClaimSinkRewards = Boolean(tranche.rewardSinkAddress) && claimableSinkRaw > 0n;
  const canHarvestWrapperRewards = Boolean(wrapperAddress) && wrapperUpstreamClaimableRaw > 0n;
  const canActivateWrapper = Boolean(wrapperGaugeAddress) && Boolean(wrapperAddress) && !tranche.wrapperIsActive;
  const canClaimWrapperRewards =
    Boolean(wrapperGaugeAddress) && Boolean(wrapperAddress) && tranche.wrapperIsActive && claimableWrapperRaw > 0n;
  const canWrap = Boolean(wrapperAddress) && parsedWrapAmount !== null && parsedWrapAmount > 0n && parsedWrapAmount <= tranche.userBalanceRaw;
  const canUnwrap = Boolean(wrapperAddress) && parsedUnwrapAmount !== null && parsedUnwrapAmount > 0n && parsedUnwrapAmount <= tranche.wrapperBalanceRaw;
  const canRedeem =
    Boolean(tranche.ledgerAddress) &&
    Boolean(parsedRedeemAmount) &&
    parsedRedeemAmount !== null &&
    parsedRedeemAmount > 0n &&
    parsedRedeemAmount <= tranche.redeemableBalanceRaw &&
    parsedRedeemAmount <= inventoryTotalRaw &&
    isSettlementWindowOpen &&
    (tranche.assetSymbol === "BTC"
      ? autoRedeemTokenIds.length > 0
      : selectedRedeemTotalRaw === parsedRedeemAmount);

  const inventoryHint =
    tranche.assetSymbol === "BTC"
      ? "BTC redemptions auto-pick the current inventory in order and can split the last veNFT if needed."
      : "MEZO redemptions need an exact token-id selection that matches the amount you want to burn.";

  const sinkRewardsSection = (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Rewards</p>
          <p className="text-xs text-white/50">Harvest rebases, then claim sink or gauge rewards.</p>
        </div>
        <Badge className="border-white/10 bg-white/5 text-white/70">
          {formatCompactRawTokenAmount(claimableSinkRaw, 18, tranche.trancheSymbol)} claimable from sink
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TransactionFlowButton
          className="w-full justify-center"
          size="sm"
          variant="secondary"
          disabled={!canHarvestRebases}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          steps={() => [
            makeContractWriteStep({
              key: `harvest-rebases-${tranche.trancheId}`,
              label: "Harvest rebases",
              displayLabelBtn: true,
              contractName: "Ledger",
              variables: {
                functionName: "claimRebases",
                args: [[tranche.trancheId]] as const,
              },
            }) as TxStep,
          ]}
          onComplete={() => {
            onActionSuccess(`Harvested rebases for ${tranche.trancheSymbol}.`);
            onRefresh();
          }}
          onError={onActionError}
        >
          Harvest rebases
        </TransactionFlowButton>

        <TransactionFlowButton
          className="w-full justify-center"
          size="sm"
          variant="secondary"
          disabled={!canClaimSinkRewards}
          icon={<Coins className="h-3.5 w-3.5" />}
          steps={({ account }) => [
            makeContractWriteStep({
              key: `claim-sink-${tranche.trancheId}`,
              label: `Claim ${tranche.trancheSymbol}`,
              displayLabelBtn: true,
              contractName: "RewardSink",
              variables: {
                functionName: "claimRewards",
                args: [account] as const,
              },
            }) as TxStep,
          ]}
          onComplete={() => {
            onActionSuccess(`Claimed ${tranche.trancheSymbol} rewards from the reward sink.`);
            setWrapAmount("");
            setUnwrapAmount("");
            onRefresh();
          }}
          onError={onActionError}
        >
          Claim sink rewards
        </TransactionFlowButton>

        {canHarvestWrapperRewards ? (
          <TransactionFlowButton
            className="w-full justify-center"
            size="sm"
            variant="outline"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            steps={() => [
              makeContractWriteStep({
                key: `harvest-wrapper-${tranche.trancheId}`,
                label: "Harvest wrapper rewards",
                displayLabelBtn: true,
                contractName: "AuroveId20",
                variables: {
                  functionName: "claimRewards",
                  args: [] as const,
                },
              }) as TxStep,
            ]}
            onComplete={() => {
              onActionSuccess(`Harvested wrapper rewards for ${tranche.trancheSymbol}.`);
              onRefresh();
            }}
            onError={onActionError}
          >
            Harvest wrapper rewards
          </TransactionFlowButton>
        ) : null}

        {canClaimWrapperRewards ? (
          <TransactionFlowButton
            className="w-full justify-center"
            size="sm"
            variant="secondary"
            icon={<Coins className="h-3.5 w-3.5" />}
            steps={({ account }) => [
              makeContractWriteStep({
                key: `claim-wrapper-${tranche.trancheId}`,
                label: `Claim ${tranche.trancheSymbol} ID20 rewards`,
                displayLabelBtn: true,
                contractName: "Id20Gauge",
                variables: {
                  functionName: "claim",
                  args: [account] as const,
                },
              }) as TxStep,
            ]}
            onComplete={() => {
              onActionSuccess(`Claimed ID20 rewards for ${tranche.trancheSymbol}.`);
              onRefresh();
            }}
            onError={onActionError}
          >
            Claim ID20 rewards
          </TransactionFlowButton>
        ) : null}

        {canActivateWrapper ? (
          <TransactionFlowButton
            className="w-full justify-center"
            size="sm"
            variant="outline"
            icon={<BadgeCheck className="h-3.5 w-3.5" />}
            steps={() => [
              makeContractWriteStep({
                key: `activate-wrapper-${tranche.trancheId}`,
                label: "Activate ID20 gauge",
                displayLabelBtn: true,
                contractName: "Id20Gauge",
                variables: {
                  functionName: "activate",
                  args: [] as const,
                },
              }) as TxStep,
            ]}
            onComplete={() => {
              onActionSuccess(`Activated the ${tranche.trancheSymbol} gauge.`);
              onRefresh();
            }}
            onError={onActionError}
          >
            Activate gauge
          </TransactionFlowButton>
        ) : null}
      </div>
    </div>
  );

  const wrapperSection = wrapperAddress ? (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Wrapper</p>
          <p className="text-xs text-white/50">
            Wrap tranche units into ID20, then unwrap them back into ERC1155 units.
          </p>
        </div>
        <AddTokenToWalletButton
          address={wrapperAddress}
          symbol={tranche.trancheSymbol}
          label="Add wrapper"
          className="shrink-0"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-[#070b10]/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`wrap-${tranche.trancheId}`} className="text-sm font-medium text-white">
              Wrap units
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
              onClick={() => setWrapAmount(formatUnits(tranche.userBalanceRaw, 18))}
              disabled={tranche.userBalanceRaw <= 0n}
            >
              Max
            </Button>
          </div>
          <Input
            id={`wrap-${tranche.trancheId}`}
            inputMode="decimal"
            placeholder="0.00"
            value={wrapAmount}
            onChange={(event) => setWrapAmount(event.target.value)}
            disabled={tranche.userBalanceRaw <= 0n}
          />
          <p className="text-xs text-white/50">
            Wrap {tranche.trancheSymbol} units into the liquid ERC20 wrapper.
          </p>
          <TransactionFlowButton
            className="w-full justify-center"
            size="sm"
            variant="secondary"
            disabled={!canWrap}
            icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            steps={({ account }) => {
              if (!parsedWrapAmount) throw new Error("Enter a wrap amount.");

              return [
                makeContractWriteStep({
                  key: `wrap-${tranche.trancheId}`,
                  label: `Wrap ${tranche.trancheSymbol}`,
                  displayLabelBtn: true,
                  contractName: "Ledger",
                  variables: {
                    functionName: "safeTransferFrom",
                    args: [account, wrapperAddress, tranche.trancheId, parsedWrapAmount, "0x"] as const,
                  },
                }) as TxStep,
              ];
            }}
            onComplete={() => {
              onActionSuccess(`Wrapped ${wrapAmount || "selected"} ${tranche.trancheSymbol} units.`);
              setWrapAmount("");
              onRefresh();
            }}
            onError={onActionError}
          >
            Wrap units
          </TransactionFlowButton>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-[#070b10]/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`unwrap-${tranche.trancheId}`} className="text-sm font-medium text-white">
              Unwrap units
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
              onClick={() => setUnwrapAmount(formatUnits(tranche.wrapperBalanceRaw, 18))}
              disabled={tranche.wrapperBalanceRaw <= 0n}
            >
              Max
            </Button>
          </div>
          <Input
            id={`unwrap-${tranche.trancheId}`}
            inputMode="decimal"
            placeholder="0.00"
            value={unwrapAmount}
            onChange={(event) => setUnwrapAmount(event.target.value)}
            disabled={tranche.wrapperBalanceRaw <= 0n}
          />
          <p className="text-xs text-white/50">
            Burn ID20 and return the underlying tranche units to your wallet.
          </p>
          <TransactionFlowButton
            className="w-full justify-center"
            size="sm"
            variant="secondary"
            disabled={!canUnwrap}
            icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            steps={({ account }) => {
              if (!parsedUnwrapAmount) throw new Error("Enter an unwrap amount.");

              return [
                makeContractWriteStep({
                  key: `unwrap-${tranche.trancheId}`,
                  label: `Unwrap ${tranche.trancheSymbol}`,
                  displayLabelBtn: true,
                  contractName: "AuroveId20",
                  variables: {
                    functionName: "unwrap",
                    args: [parsedUnwrapAmount, account] as const,
                  },
                }) as TxStep,
              ];
            }}
            onComplete={() => {
              onActionSuccess(`Unwrapped ${unwrapAmount || "selected"} ${tranche.trancheSymbol} units.`);
              setUnwrapAmount("");
              onRefresh();
            }}
            onError={onActionError}
          >
            Unwrap units
          </TransactionFlowButton>
        </div>
      </div>
    </div>
  ) : (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div>
        <p className="text-sm font-medium text-white">Wrapper</p>
        <p className="text-xs text-white/50">
          This tranche does not have an ID20 wrapper yet. Create it to enable wrapping, unwrapping,
          and gauge rewards.
        </p>
      </div>

      <TransactionFlowButton
        className="w-full justify-center"
        size="sm"
        variant="secondary"
        disabled={!canCreateWrapper}
        icon={<Sparkles className="h-3.5 w-3.5" />}
        steps={() => [
          makeContractWriteStep({
            key: `create-wrapper-${tranche.trancheId}`,
            label: `Create ${tranche.trancheSymbol} wrapper`,
            displayLabelBtn: true,
            contractName: "Id20Factory",
            variables: {
              functionName: "getOrCreateId20",
              args: [tranche.trancheId] as const,
            },
          }) as TxStep,
        ]}
        onComplete={() => {
          onActionSuccess(`Created the ${tranche.trancheSymbol} wrapper.`);
          onRefresh();
        }}
        onError={onActionError}
      >
        Create ID20 wrapper
      </TransactionFlowButton>
    </div>
  );

  const redeemSection = (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Redeem</p>
          <p className="text-xs text-white/50">{formatSettlementStatus(chainTimestamp, settlementWindow)}</p>
        </div>
        <Badge
          className={cn(
            "border-white/10",
            isSettlementWindowOpen
              ? "bg-emerald-300/10 text-emerald-100"
              : "bg-amber-300/10 text-amber-100",
          )}
        >
          {isSettlementWindowOpen ? "Settlement open" : "Settlement closed"}
        </Badge>
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-[#070b10]/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`redeem-${tranche.trancheId}`} className="text-sm font-medium text-white">
            Redeem amount
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
            onClick={() => setRedeemAmount(formatUnits(tranche.redeemableBalanceRaw, 18))}
            disabled={tranche.redeemableBalanceRaw <= 0n}
          >
            Max
          </Button>
        </div>
        <Input
          id={`redeem-${tranche.trancheId}`}
          inputMode="decimal"
          placeholder="0.00"
          value={redeemAmount}
          onChange={(event) => setRedeemAmount(event.target.value)}
          disabled={!isSettlementWindowOpen || tranche.redeemableBalanceRaw <= 0n}
        />
        <p className="text-xs text-white/50">{inventoryHint}</p>
      </div>

      {tranche.assetSymbol === "MEZO" && inventoryTokens.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Select managed veNFTs</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
                onClick={() => setSelectedRedeemIds(new Set(inventoryTokens.map((token) => token.tokenId.toString())))}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
                onClick={() => setSelectedRedeemIds(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {inventoryTokens.map((token) => {
              const key = token.tokenId.toString();
              const selected = selectedRedeemIds.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={inventorySelectionClasses(selected)}
                  onClick={() => {
                    setSelectedRedeemIds((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">veNFT #{token.tokenId.toString()}</span>
                    <span className="text-[11px] text-white/50">
                      {token.isPermanent ? "Permanent" : formatDateLabel(token.lockEnd)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    {formatCompactRawTokenAmount(token.amountRaw, 18, tranche.assetSymbol)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : tranche.assetSymbol === "BTC" && inventoryTokens.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs text-white/55">
            The card will auto-pick the tranche inventory in order until it covers your redeem
            amount.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {inventoryTokens.map((token) => (
              <div
                key={token.tokenId.toString()}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>veNFT #{token.tokenId.toString()}</span>
                  <span>{token.isPermanent ? "Permanent" : formatDateLabel(token.lockEnd)}</span>
                </div>
                <p className="mt-1 text-white/80">
                  {formatCompactRawTokenAmount(token.amountRaw, 18, tranche.assetSymbol)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-1">
          <p className="text-xs text-white/50">
            Redeemable balance:{" "}
            {formatCompactRawTokenAmount(tranche.redeemableBalanceRaw, 18, tranche.trancheSymbol)}
          </p>
          <p className="text-xs text-white/50">
            Inventory total: {formatCompactRawTokenAmount(inventoryTotalRaw, 18, tranche.assetSymbol)}
          </p>
        </div>
        <TransactionFlowButton
          className="w-full justify-center md:w-auto"
          size="sm"
          variant="secondary"
          disabled={!canRedeem}
          icon={<Wallet className="h-3.5 w-3.5" />}
          steps={({ account }) => {
            if (!parsedRedeemAmount) throw new Error("Enter a redeem amount.");

            const tokenIds =
              tranche.assetSymbol === "BTC"
                ? autoRedeemTokenIds
                : selectedRedeemTokens.map((token) => token.tokenId);

            if (tokenIds.length === 0) throw new Error("Select at least one veNFT to redeem.");

            return [
              makeContractWriteStep({
                key: `redeem-${tranche.trancheId}`,
                label: `Redeem ${tranche.trancheSymbol}`,
                displayLabelBtn: true,
                contractName: "Ledger",
                variables: {
                  functionName: "redeem",
                  args: [tranche.trancheId, parsedRedeemAmount, account, tokenIds] as const,
                },
              }) as TxStep,
            ];
          }}
          onComplete={() => {
            onActionSuccess(`Redeemed ${redeemAmount || "selected"} units from ${tranche.trancheSymbol}.`);
            setRedeemAmount("");
            setSelectedRedeemIds(new Set());
            onRefresh();
          }}
          onError={onActionError}
        >
          Redeem
        </TransactionFlowButton>
      </div>
    </div>
  );

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,18,0.96),rgba(5,8,12,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.35)]",
        tranche.variant === "veBTC"
          ? "ring-1 ring-amber-300/10"
          : "ring-1 ring-sky-300/10",
      )}
    >
      <CardHeader className="space-y-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={toneClasses(tranche.variant)}>{tranche.variant}</Badge>
              <Badge className="border-white/10 bg-white/5 text-white/70">
                Managed {tranche.managedEpochs}-week tranche
              </Badge>
              <Badge
                className={cn(
                  "border-white/10",
                  tranche.wrapperAddress
                    ? "bg-white/5 text-white/70"
                    : "bg-amber-300/10 text-amber-100",
                )}
              >
                {tranche.wrapperAddress ? "Wrapper available" : "Wrapper not deployed"}
              </Badge>
            </div>
            <CardTitle className="text-2xl text-white">{tranche.trancheSymbol}</CardTitle>
            <CardDescription className="max-w-2xl text-white/60">{tranche.trancheName}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tranche.wrapperAddress ? (
              <AddTokenToWalletButton
                address={tranche.wrapperAddress}
                symbol={tranche.trancheSymbol}
                label="Add wrapper"
                className="shrink-0"
              />
            ) : null}

            {canCreateWrapper ? (
              <TransactionFlowButton
                className="shrink-0"
                size="sm"
                variant="secondary"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                steps={() => [
                  makeContractWriteStep({
                    key: `create-wrapper-${tranche.trancheId}`,
                    label: `Create ${tranche.trancheSymbol} wrapper`,
                    displayLabelBtn: true,
                    contractName: "Id20Factory",
                    variables: {
                      functionName: "getOrCreateId20",
                      args: [tranche.trancheId] as const,
                    },
                  }) as TxStep,
                ]}
                onComplete={() => {
                  onActionSuccess(`Created the ${tranche.trancheSymbol} wrapper.`);
                  onRefresh();
                }}
                onError={onActionError}
              >
                Create wrapper
              </TransactionFlowButton>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Managed balance"
            value={formatCompactRawTokenAmount(tranche.userBalanceRaw, 18, tranche.trancheSymbol)}
          />
          <StatTile
            label="Redeemable"
            value={formatCompactRawTokenAmount(tranche.redeemableBalanceRaw, 18, tranche.trancheSymbol)}
          />
          <StatTile
            label="Locked"
            value={formatCompactRawTokenAmount(tranche.lockedBalanceRaw, 18, tranche.trancheSymbol)}
          />
          <StatTile
            label="Wrapper balance"
            value={formatCompactRawTokenAmount(tranche.wrapperBalanceRaw, 18, tranche.trancheSymbol)}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DetailTile label="Manager" value={shortAddress(tranche.managerAddress)} />
          <DetailTile label="Reward sink" value={shortAddress(tranche.rewardSinkAddress)} />
          <DetailTile label="Wrapper" value={shortAddress(tranche.wrapperAddress)} />
          <DetailTile label="Gauge" value={shortAddress(wrapperGaugeAddress)} />
          <DetailTile label="Upstream sink" value={shortAddress(tranche.wrapperUpstreamRewardSinkAddress)} />
          <DetailTile
            label="Settlement"
            value={formatSettlementStatus(chainTimestamp, settlementWindow)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tranche.wrapperAddress ? (
            <Badge
              className={cn(
                "border-white/10",
                tranche.wrapperIsFullyBacked === true
                  ? "bg-emerald-300/10 text-emerald-100"
                  : tranche.wrapperIsFullyBacked === false
                    ? "bg-amber-300/10 text-amber-100"
                    : "bg-white/5 text-white/70",
              )}
            >
              {tranche.wrapperIsFullyBacked === true
                ? "Fully backed"
                : tranche.wrapperIsFullyBacked === false
                  ? "Underbacked"
                  : "Backing unknown"}
            </Badge>
          ) : null}
          <Badge className="border-white/10 bg-white/5 text-white/70">
            {tranche.vaultTokenIds.length} managed veNFT{tranche.vaultTokenIds.length === 1 ? "" : "s"}
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            {formatCompactRawTokenAmount(tranche.wrapperBackingBalanceRaw, 18, tranche.trancheSymbol)} backed
          </Badge>
        </div>

        {sinkRewardsSection}
        {wrapperSection}
        {redeemSection}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}
