"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRightLeft, Coins, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@ui";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { useChainTime } from "@/lib/web3/use-chain-time";
import {
  formatCompactRawTokenAmount,
  parseAmountRaw,
  readAddress,
  readBigint,
  readBoolean,
  readNumber,
} from "@/lib/web3/value-parsers";
import { useEarnSnapshot, type EarnSnapshot } from "./use-earn-data";
import { EarnPositionCard } from "./earn-position-card";
import { getEarnVariantConfig, type EarnVariantConfig, veNftCollectionAbi } from "./protocol";
import {
  EARN_VARIANTS,
  getVariantAssetSymbol,
  type EarnVariant,
} from "./utils/tranche";
import { useUserVeNFTs, type UserVeNftCollection } from "./hooks/use-user-ve-nfts";

type CreatePositionMode = "erc20" | "venft";

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
  settlementWindow: EarnSnapshot["settlementWindow"],
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

function toneClasses(variant: EarnVariant): string {
  return variant === "veBTC"
    ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
    : "border-sky-300/25 bg-sky-300/10 text-sky-100";
}

function makeVeNftKey(contractAddress: Address, tokenId: bigint): string {
  return `${contractAddress}-${tokenId.toString()}`;
}

function metricTone(variant: EarnVariant): string {
  return variant === "veBTC"
    ? "text-amber-100 border-amber-300/20 bg-amber-300/10"
    : "text-sky-100 border-sky-300/20 bg-sky-300/10";
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "success" | "error" | "info";
  title: string;
  children: string;
}) {
  const classes =
    tone === "success"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50"
      : tone === "error"
        ? "border-rose-300/25 bg-rose-300/10 text-rose-50"
        : "border-white/10 bg-white/5 text-white/80";

  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm", classes)}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-white/75">{children}</p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</p>
        <div className="text-white/55">{icon}</div>
      </div>
      <p className="mt-2 break-words text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function IntroCard({
  protocol,
  chainTimestamp,
  snapshot,
  isConnected,
  isRefreshing,
  onRefresh,
}: {
  protocol: EarnSnapshot["protocol"];
  chainTimestamp: bigint | null;
  snapshot: EarnSnapshot;
  isConnected: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const wrapperCount = snapshot.tranches.filter((tranche) => Boolean(tranche.wrapperAddress)).length;
  const activeWrapperCount = snapshot.tranches.filter(
    (tranche) => Boolean(tranche.wrapperAddress) && tranche.wrapperIsActive,
  ).length;

  return (
    <Card className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,18,0.98),rgba(5,8,12,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
      <CardHeader className="space-y-4 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(181,143,95,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_40%)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/5 text-white/75">Current core</Badge>
              <Badge className="border-white/10 bg-white/5 text-white/75">
                {protocol.environment.toUpperCase()} chain {protocol.chainId}
              </Badge>
            </div>
            <CardTitle className="flex items-center gap-3 text-3xl text-white">
              <Sparkles className="h-6 w-6 text-[var(--accent)]" />
              Earn on Aurove
            </CardTitle>
            <CardDescription className="max-w-2xl text-white/65">
              Lock BTC or MEZO into managed tranches, receive ERC1155 tranche units, wrap them into
              ID20, and claim rewards or redeem inventory directly from the current ledger, vault,
              and gauge contracts.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="shrink-0 gap-2"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Wallet"
            value={isConnected ? "Connected" : "Connect wallet"}
            icon={<Wallet className="h-4 w-4" />}
          />
          <MetricTile
            label="Managed tranches"
            value={snapshot.tranches.length.toString()}
            icon={<ArrowRightLeft className="h-4 w-4" />}
          />
          <MetricTile
            label="Wrappers deployed"
            value={`${wrapperCount} total / ${activeWrapperCount} active`}
            icon={<Coins className="h-4 w-4" />}
          />
          <MetricTile
            label="Settlement"
            value={formatSettlementStatus(chainTimestamp, snapshot.settlementWindow)}
            icon={<Sparkles className="h-4 w-4" />}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Current epoch</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {snapshot.currentEpoch !== null ? `Week ${snapshot.currentEpoch.toString()}` : "Waiting for chain time"}
            </p>
            <p className="mt-2 text-sm text-white/60">
              Reward sink claims mint tranche units. ID20 rewards are harvested into the gauge
              separately.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Current flow</p>
            <ol className="mt-3 space-y-2 text-sm text-white/70">
              <li className="flex gap-3">
                <span className="text-[var(--accent)]">1.</span>
                Select BTC or MEZO.
              </li>
              <li className="flex gap-3">
                <span className="text-[var(--accent)]">2.</span>
                Lock ERC20 or deposit an existing veNFT.
              </li>
              <li className="flex gap-3">
                <span className="text-[var(--accent)]">3.</span>
                Receive tranche units, then wrap them into ID20 if you want a liquid ERC20 balance.
              </li>
              <li className="flex gap-3">
                <span className="text-[var(--accent)]">4.</span>
                Claim rewards, activate the gauge, or redeem during settlement.
              </li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DepositCard({
  protocol,
  selectedVariant,
  setSelectedVariant,
  selectedVariantConfig,
  veCollections,
  depositMode,
  setDepositMode,
  depositAmount,
  setDepositAmount,
  selectedVeNftKey,
  setSelectedVeNftKey,
  onRefresh,
  onActionSuccess,
  onActionError,
}: {
  protocol: EarnSnapshot["protocol"];
  selectedVariant: EarnVariant;
  setSelectedVariant: (variant: EarnVariant) => void;
  selectedVariantConfig: EarnVariantConfig;
  veCollections: UserVeNftCollection[];
  depositMode: CreatePositionMode;
  setDepositMode: (mode: CreatePositionMode) => void;
  depositAmount: string;
  setDepositAmount: (value: string) => void;
  selectedVeNftKey: string;
  setSelectedVeNftKey: (value: string) => void;
  onRefresh: () => void;
  onActionSuccess: (message: string) => void;
  onActionError: (message: string) => void;
}) {
  const { address: userAddress } = useAccount();
  const selectedCollection = veCollections.find((collection) => collection.variant === selectedVariant) ?? null;
  const selectedVeNft = useMemo(() => {
    const candidates = selectedCollection?.veNfts ?? [];
    if (candidates.length === 0) return null;

    const validSelection = selectedVeNftKey
      ? candidates.find((candidate) => makeVeNftKey(candidate.contractAddress, candidate.tokenId) === selectedVeNftKey) ?? null
      : null;

    return validSelection ?? candidates[0] ?? null;
  }, [selectedCollection?.veNfts, selectedVeNftKey]);

  const collectionTokenReads = useReadContracts({
    allowFailure: true,
    contracts: selectedVariantConfig.collectionAddress
      ? [
          {
            address: selectedVariantConfig.collectionAddress,
            abi: veNftCollectionAbi,
            functionName: "token" as const,
            chainId: protocol.chainId,
          },
        ]
      : [],
    query: {
      enabled: Boolean(selectedVariantConfig.collectionAddress),
      ...staticReadQueryOptions,
    },
  });

  const underlyingTokenAddress = readAddress(collectionTokenReads.data?.[0]?.result);

  const underlyingTokenReads = useReadContracts({
    allowFailure: true,
    contracts:
      userAddress && underlyingTokenAddress && protocol.addresses.ledgerAddress
        ? [
            {
              address: underlyingTokenAddress,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [userAddress] as const,
              chainId: protocol.chainId,
            },
            {
              address: underlyingTokenAddress,
              abi: erc20Abi,
              functionName: "allowance" as const,
              args: [userAddress, protocol.addresses.ledgerAddress] as const,
              chainId: protocol.chainId,
            },
            {
              address: underlyingTokenAddress,
              abi: erc20Abi,
              functionName: "decimals" as const,
              chainId: protocol.chainId,
            },
            {
              address: underlyingTokenAddress,
              abi: erc20Abi,
              functionName: "symbol" as const,
              chainId: protocol.chainId,
            },
          ]
        : [],
    query: {
      enabled: Boolean(userAddress && underlyingTokenAddress && protocol.addresses.ledgerAddress),
      ...staticReadQueryOptions,
    },
  });

  const underlyingBalanceRaw = readBigint(underlyingTokenReads.data?.[0]?.result) ?? 0n;
  const underlyingAllowanceRaw = readBigint(underlyingTokenReads.data?.[1]?.result) ?? 0n;
  const underlyingDecimals = readNumber(underlyingTokenReads.data?.[2]?.result) ?? 18;
  const underlyingSymbol =
    (typeof underlyingTokenReads.data?.[3]?.result === "string" && underlyingTokenReads.data?.[3]?.result) ||
    getVariantAssetSymbol(selectedVariant);

  const selectedVeNftApprovalReads = useReadContracts({
    allowFailure: true,
    contracts:
      depositMode === "venft" &&
      userAddress &&
      selectedVeNft &&
      protocol.addresses.ledgerAddress
        ? [
            {
              address: selectedVeNft.contractAddress,
              abi: veNftCollectionAbi,
              functionName: "getApproved" as const,
              args: [selectedVeNft.tokenId] as const,
              chainId: protocol.chainId,
            },
            {
              address: selectedVeNft.contractAddress,
              abi: veNftCollectionAbi,
              functionName: "isApprovedForAll" as const,
              args: [userAddress, protocol.addresses.ledgerAddress] as const,
              chainId: protocol.chainId,
            },
          ]
        : [],
    query: {
      enabled: Boolean(
        depositMode === "venft" &&
          userAddress &&
          selectedVeNft &&
          protocol.addresses.ledgerAddress,
      ),
      ...staticReadQueryOptions,
    },
  });

  const approvedAddress = readAddress(selectedVeNftApprovalReads.data?.[0]?.result);
  const isApprovedForAll = readBoolean(selectedVeNftApprovalReads.data?.[1]?.result);

  const depositAmountRaw = parseAmountRaw(depositAmount, underlyingDecimals);
  const selectedVariantTrancheSymbol = selectedVariantConfig.trancheSymbol;
  const selectedVariantAssetSymbol = selectedVariantConfig.assetSymbol;
  const selectedVariantCollectionToken = selectedVariantConfig.collectionAddress ? shortAddress(selectedVariantConfig.collectionAddress) : "Unavailable";

  useEffect(() => {
    if (depositMode !== "venft") return;
    const firstVeNft = selectedCollection?.veNfts[0];
    const validSelected = selectedCollection?.veNfts.some(
      (candidate) => makeVeNftKey(candidate.contractAddress, candidate.tokenId) === selectedVeNftKey,
    );

    if (!validSelected) {
      setSelectedVeNftKey(firstVeNft ? makeVeNftKey(firstVeNft.contractAddress, firstVeNft.tokenId) : "");
    }
  }, [depositMode, selectedCollection?.veNfts, selectedVeNftKey, setSelectedVeNftKey]);

  const needsUnderlyingApproval =
    depositMode === "erc20" &&
    depositAmountRaw !== null &&
    depositAmountRaw > 0n &&
    underlyingAllowanceRaw < depositAmountRaw;

  const needsVeNftApproval =
    depositMode === "venft" &&
    Boolean(selectedVeNft) &&
    Boolean(protocol.addresses.ledgerAddress) &&
    !isApprovedForAll &&
    approvedAddress?.toLowerCase() !== protocol.addresses.ledgerAddress?.toLowerCase();

  const depositSteps = ({ account }: { account: Address; chainId: number }): TxStep[] => {
    if (depositMode === "erc20") {
      if (!protocol.addresses.ledgerAddress || !selectedVariantConfig.collectionAddress || !underlyingTokenAddress) {
        throw new Error("ERC20 deposit inputs are incomplete.");
      }
      if (!depositAmountRaw || depositAmountRaw <= 0n) {
        throw new Error("Enter a valid deposit amount.");
      }

      const steps: TxStep[] = [];
      if (needsUnderlyingApproval) {
        steps.push(
          makeAddressWriteStep({
            key: `approve-underlying-${selectedVariantConfig.trancheId}`,
            label: `Approve ${underlyingSymbol}`,
            displayLabelBtn: true,
            address: underlyingTokenAddress,
            abi: erc20Abi,
            variables: {
              functionName: "approve",
              args: [protocol.addresses.ledgerAddress, depositAmountRaw] as const,
            },
          }) as TxStep,
        );
      }

      steps.push(
        makeContractWriteStep({
          key: `deposit-erc20-${selectedVariantConfig.trancheId}`,
          label: `Deposit ${underlyingSymbol}`,
          displayLabelBtn: true,
          contractName: "Ledger",
          variables: {
            functionName: "depositErc20",
            args: [selectedVariant === "veBTC" ? 1n : 2n, BigInt(selectedVariantConfig.managedEpochs), depositAmountRaw, account] as const,
          },
        }) as TxStep,
      );

      return steps;
    }

    if (!selectedVeNft || !protocol.addresses.ledgerAddress) {
      throw new Error("veNFT deposit inputs are incomplete.");
    }

    const steps: TxStep[] = [];
    if (needsVeNftApproval) {
      steps.push(
        makeAddressWriteStep({
          key: `approve-venft-${selectedVariantConfig.trancheId}`,
          label: "Approve veNFT",
          displayLabelBtn: true,
          address: selectedVeNft.contractAddress,
          abi: veNftCollectionAbi,
          variables: {
            functionName: "approve",
            args: [protocol.addresses.ledgerAddress, selectedVeNft.tokenId] as const,
          },
        }) as TxStep,
      );
    }

    steps.push(
      makeContractWriteStep({
        key: `deposit-venft-${selectedVariantConfig.trancheId}`,
        label: "Deposit veNFT",
        displayLabelBtn: true,
        contractName: "Ledger",
        variables: {
          functionName: "depositVeNft",
          args: [selectedVariant === "veBTC" ? 1n : 2n, BigInt(selectedVariantConfig.managedEpochs), selectedVeNft.tokenId, account] as const,
        },
      }) as TxStep,
    );

    return steps;
  };

  const erc20DisabledReason = !protocol.addresses.ledgerAddress
    ? "The ledger address is unavailable on this network."
    : !underlyingTokenAddress
      ? "Unable to resolve the underlying token for this tranche."
      : !depositAmountRaw
        ? "Enter an amount to lock."
        : depositAmountRaw > underlyingBalanceRaw
          ? "Insufficient wallet balance."
          : null;

  const veNftDisabledReason = !protocol.addresses.ledgerAddress
    ? "The ledger address is unavailable on this network."
    : !selectedVeNft
      ? "Choose a veNFT to deposit."
      : null;

  const receiptPreview =
    depositMode === "erc20" && depositAmountRaw
      ? formatCompactRawTokenAmount(depositAmountRaw, underlyingDecimals, selectedVariantTrancheSymbol)
      : depositMode === "venft" && selectedVeNft
        ? `${selectedVeNft.lockAmountFormatted} ${selectedVariantTrancheSymbol}`
        : `Receive ${selectedVariantTrancheSymbol} tranche units`;

  const receiptAssetLabel =
    depositMode === "erc20"
      ? `${selectedVariantAssetSymbol} locked`
      : `${selectedVariantAssetSymbol} veNFT deposited`;

  return (
    <Card className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(7,10,15,0.98),rgba(4,7,10,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.3)]">
      <CardHeader className="space-y-4 border-b border-white/10 bg-white/[0.02]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={toneClasses(selectedVariant)}>
              {selectedVariantConfig.variant}
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              Managed {selectedVariantConfig.managedEpochs}-week tranche
            </Badge>
          </div>
          <CardTitle className="text-2xl text-white">
            Open {selectedVariantConfig.trancheSymbol}
          </CardTitle>
          <CardDescription className="max-w-2xl text-white/60">
            Lock {underlyingSymbol} or deposit a supported veNFT. You receive{" "}
            {selectedVariantConfig.trancheSymbol} tranche units, which can later be wrapped into a
            liquid ERC20 or redeemed during settlement.
          </CardDescription>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {EARN_VARIANTS.map((variant) => {
            const config = getEarnVariantConfig(variant, protocol);
            const isSelected = selectedVariant === variant;
            return (
              <Button
                key={variant}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                className={cn(
                  "justify-start gap-2",
                  isSelected && metricTone(variant),
                  !isSelected && "border-white/10 bg-white/[0.02] text-white/75 hover:bg-white/5",
                )}
                onClick={() => setSelectedVariant(variant)}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", variant === "veBTC" ? "bg-amber-300" : "bg-sky-300")} />
                <span>{config.trancheSymbol}</span>
                <span className="ml-auto text-xs text-white/45">{getVariantAssetSymbol(variant)}</span>
              </Button>
            );
          })}
        </div>

        <Tabs value={depositMode} onValueChange={(value) => setDepositMode(value as CreatePositionMode)}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="erc20">Lock ERC20</TabsTrigger>
            <TabsTrigger value="venft">Deposit veNFT</TabsTrigger>
          </TabsList>

          <TabsContent value="erc20">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Underlying token</p>
                  <p className="text-xs text-white/50">
                    Contract {selectedVariantCollectionToken} /{" "}
                    {underlyingTokenAddress ? shortAddress(underlyingTokenAddress) : "loading..."}
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/5 text-white/70">
                  Receives {selectedVariantTrancheSymbol}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`deposit-erc20-${selectedVariantConfig.trancheId}`} className="text-sm font-medium text-white">
                      Deposit amount
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-white/60 hover:bg-white/5 hover:text-white"
                      onClick={() => setDepositAmount(formatUnits(underlyingBalanceRaw, underlyingDecimals))}
                      disabled={underlyingBalanceRaw <= 0n}
                    >
                      Max
                    </Button>
                  </div>
                  <Input
                    id={`deposit-erc20-${selectedVariantConfig.trancheId}`}
                    inputMode="decimal"
                    placeholder={`0.00 ${underlyingSymbol}`}
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    disabled={!underlyingTokenAddress}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                    <span>
                      Balance {formatCompactRawTokenAmount(underlyingBalanceRaw, underlyingDecimals, underlyingSymbol)}
                    </span>
                    <span>Allowance {formatCompactRawTokenAmount(underlyingAllowanceRaw, underlyingDecimals, underlyingSymbol)}</span>
                    <span>Approvals are requested automatically when needed.</span>
                  </div>
                </div>

                <TransactionFlowButton
                  className="w-full justify-center md:w-auto"
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(erc20DisabledReason)}
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  steps={depositSteps}
                  onComplete={() => {
                    onActionSuccess(
                      `Locked ${depositAmount || "selected"} ${underlyingSymbol} into ${selectedVariantTrancheSymbol}.`,
                    );
                    setDepositAmount("");
                    onRefresh();
                  }}
                  onError={onActionError}
                >
                  Deposit {underlyingSymbol}
                </TransactionFlowButton>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#070b10]/70 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">Receipt</p>
                <p className="mt-2 text-lg font-semibold text-white">{receiptPreview}</p>
                <p className="mt-1 text-sm text-white/55">
                  {receiptAssetLabel}. You can wrap the resulting tranche units into the liquid ID20
                  wrapper later.
                </p>
              </div>

              {erc20DisabledReason ? (
                <p className="text-xs text-amber-100/80">{erc20DisabledReason}</p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="venft">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Supported veNFTs</p>
                  <p className="text-xs text-white/50">
                    {selectedCollection?.veNfts.length ?? 0} visible veNFT
                    {selectedCollection && selectedCollection.hiddenCount > 0
                      ? `, +${selectedCollection.hiddenCount} hidden`
                      : ""}
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/5 text-white/70">
                  Receives {selectedVariantTrancheSymbol}
                </Badge>
              </div>

              {selectedCollection && selectedCollection.veNfts.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor={`deposit-venft-${selectedVariantConfig.trancheId}`} className="text-sm font-medium text-white">
                      Choose veNFT
                    </label>
                    <select
                      id={`deposit-venft-${selectedVariantConfig.trancheId}`}
                      className="w-full rounded-xl border border-white/10 bg-[#070b10]/80 px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--accent)]"
                      value={selectedVeNft ? makeVeNftKey(selectedVeNft.contractAddress, selectedVeNft.tokenId) : ""}
                      onChange={(event) => setSelectedVeNftKey(event.target.value)}
                    >
                      {selectedCollection.veNfts.map((veNft) => {
                        const key = makeVeNftKey(veNft.contractAddress, veNft.tokenId);
                        return (
                          <option key={key} value={key}>
                            #{veNft.tokenId.toString()} - {veNft.lockAmountFormatted} {selectedVariantAssetSymbol}
                            {" "}
                            until {veNft.lockEndLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {selectedVeNft ? (
                    <div className="rounded-xl border border-white/10 bg-[#070b10]/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Selected veNFT</p>
                          <p className="mt-2 text-lg font-semibold text-white">
                            #{selectedVeNft.tokenId.toString()} - {selectedVeNft.lockAmountFormatted}{" "}
                            {selectedVariantAssetSymbol}
                          </p>
                          <p className="mt-1 text-sm text-white/55">
                            Locks until {selectedVeNft.lockEndLabel}.
                          </p>
                        </div>
                        <Badge className="border-white/10 bg-white/5 text-white/70">
                          Receives {selectedVariantTrancheSymbol}
                        </Badge>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div className="space-y-1 text-xs text-white/50">
                      <p>
                        Approval status:{" "}
                        {needsVeNftApproval
                          ? "Approve this veNFT for the ledger before depositing."
                          : "Ready to deposit."}
                      </p>
                      <p>
                        The tranche units are minted at a 1:1 rate against the locked veNFT amount.
                      </p>
                    </div>

                    <TransactionFlowButton
                      className="w-full justify-center md:w-auto"
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(veNftDisabledReason)}
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                      steps={depositSteps}
                      onComplete={() => {
                        onActionSuccess(
                          `Deposited ${selectedVeNft?.tokenId.toString() ?? "selected"} into ${selectedVariantTrancheSymbol}.`,
                        );
                        setDepositAmount("");
                        onRefresh();
                      }}
                      onError={onActionError}
                    >
                      Deposit veNFT
                    </TransactionFlowButton>
                  </div>

                  {veNftDisabledReason ? (
                    <p className="text-xs text-amber-100/80">{veNftDisabledReason}</p>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-[#070b10]/60 p-4 text-sm text-white/55">
                  No supported veNFTs were found for this variant in your wallet.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardHeader>
    </Card>
  );
}

export function EarnPage() {
  const { chainTimestamp } = useChainTime();
  const { address: userAddress, isConnected } = useAccount();
  const snapshot = useEarnSnapshot();
  const {
    veCollections,
    isLoading: veNftsLoading,
    isFetching: veNftsFetching,
    error: veNftsError,
    refresh: refreshVeNfts,
  } = useUserVeNFTs();

  const [selectedVariant, setSelectedVariant] = useState<EarnVariant>("veBTC");
  const [depositMode, setDepositMode] = useState<CreatePositionMode>("erc20");
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedVeNftKey, setSelectedVeNftKey] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedVariantConfig =
    snapshot.variantConfigs.find((variantConfig) => variantConfig.variant === selectedVariant) ??
    getEarnVariantConfig(selectedVariant, snapshot.protocol);

  const refreshing = snapshot.isFetching || veNftsFetching;

  const handleRefreshAll = () => {
    snapshot.refresh();
    refreshVeNfts();
  };

  const handleSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  useEffect(() => {
    if (!successMessage && !errorMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
      setErrorMessage(null);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, successMessage]);

  useEffect(() => {
    const selectedCollection = veCollections.find((collection) => collection.variant === selectedVariant);
    if (!selectedCollection || selectedCollection.veNfts.length === 0) {
      setSelectedVeNftKey("");
      return;
    }

    const keyIsValid = selectedCollection.veNfts.some(
      (veNft) => makeVeNftKey(veNft.contractAddress, veNft.tokenId) === selectedVeNftKey,
    );
    if (!keyIsValid) {
      const first = selectedCollection.veNfts[0];
      setSelectedVeNftKey(makeVeNftKey(first.contractAddress, first.tokenId));
    }
  }, [selectedVariant, selectedVeNftKey, veCollections]);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <IntroCard
          protocol={snapshot.protocol}
          chainTimestamp={chainTimestamp}
          snapshot={snapshot}
          isConnected={isConnected}
          isRefreshing={refreshing}
          onRefresh={handleRefreshAll}
        />

        <DepositCard
          protocol={snapshot.protocol}
          selectedVariant={selectedVariant}
          setSelectedVariant={setSelectedVariant}
          selectedVariantConfig={selectedVariantConfig}
          veCollections={veCollections}
          depositMode={depositMode}
          setDepositMode={setDepositMode}
          depositAmount={depositAmount}
          setDepositAmount={setDepositAmount}
          selectedVeNftKey={selectedVeNftKey}
          setSelectedVeNftKey={setSelectedVeNftKey}
          onRefresh={handleRefreshAll}
          onActionSuccess={handleSuccess}
          onActionError={handleError}
        />
      </section>

      {snapshot.error ? (
        <Banner tone="error" title="Protocol read error">
          {snapshot.error.message}
        </Banner>
      ) : null}

      {veNftsError ? (
        <Banner tone="error" title="veNFT read error">
          {veNftsError.message}
        </Banner>
      ) : null}

      {successMessage ? (
        <Banner tone="success" title="Transaction complete">
          {successMessage}
        </Banner>
      ) : null}

      {errorMessage ? (
        <Banner tone="error" title="Transaction failed">
          {errorMessage}
        </Banner>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Badge className="border-white/10 bg-white/5 text-white/70">Managed positions</Badge>
            <h2 className="mt-3 text-2xl font-semibold text-white">Your tranches</h2>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Each card reflects the live ledger balance, redeemable status, wrapper state, and
              the reward sinks attached to that tranche.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh positions
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {snapshot.tranches.map((tranche) => (
            <EarnPositionCard
              key={tranche.trancheId.toString()}
              tranche={tranche}
              chainId={snapshot.protocol.chainId}
              chainTimestamp={chainTimestamp}
              settlementWindow={snapshot.settlementWindow}
              isSettlementWindowOpen={snapshot.isSettlementWindowOpen}
              onRefresh={handleRefreshAll}
              onActionSuccess={handleSuccess}
              onActionError={handleError}
            />
          ))}
        </div>
      </section>

      {snapshot.isLoading || veNftsLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          Loading the current Earn snapshot and wallet positions...
        </div>
      ) : null}
    </div>
  );
}
