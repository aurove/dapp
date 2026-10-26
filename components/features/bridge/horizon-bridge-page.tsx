"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, ExternalLink, RefreshCw, ShieldCheck, Waypoints } from "lucide-react";
import { erc20Abi, formatEther, formatUnits, parseUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { mezoTestnetChain, resolveAppEnvironment } from "@/lib/config/chains";
import { HORIZON_TESTNET, getHorizonPeerChain, type HorizonNativeChainId } from "@/lib/bridge/horizon";
import { initiateHorizonNttTransfer, quoteHorizonNttDeliveryFee } from "@/lib/bridge/ntt-transfer";
import { BridgeTokenInput } from "@/components/features/bridge/bridge-token-input";
import {
  BRIDGE_FAMILY_CONFIG,
  buildBridgeSourceOptions,
  resolveSelectedBridgeSource,
  type BridgeFamily,
  type BridgeMode,
  type BridgeSource,
} from "@/components/features/bridge/bridge-sources";
import { makeBridgeVaultConversionStep } from "@/components/features/bridge/bridge-vault-batch";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { type TxStep } from "@/lib/tx-flow";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";
import {
  fetchWormholeOperations,
  findWormholeOperation,
  getChainTxUrl,
  getWormholeOperationStatus,
  getWormholeTxUrl,
  readBridgeHistory,
  saveBridgeHistoryEntry,
  type BridgeHistoryEntry,
} from "@/lib/bridge/wormholescan";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import { usePortfolioSummary, useWalletPortfolio } from "@/features/portfolio";

const bridgeModeOptions: Array<{ id: BridgeMode; label: string }> = [
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
];

const familyOptions: Array<{ id: BridgeFamily; label: string; icon: string }> = [
  { id: "veMEZO", label: "veMEZO", icon: "/tokens/MEZO.png" },
  { id: "veBTC", label: "veBTC", icon: "/tokens/BTC.png" },
];

/** Deposit bridges Base → Mezo; withdraw bridges Mezo → Base. */
function sourceChainIdForMode(mode: BridgeMode): HorizonNativeChainId {
  return mode === "withdraw" ? 31611 : 84532;
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

function normalizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");
  if (fractions.length === 0) return whole;
  return `${whole}.${fractions.join("").slice(0, 18)}`;
}

export function HorizonBridgePage() {
  const environment = resolveAppEnvironment();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { notify } = useTxFlowRuntime();
  const portfolio = usePortfolioSummary();
  const walletPortfolio = useWalletPortfolio();

  const [bridgeMode, setBridgeMode] = useState<BridgeMode>(() => (chainId === 84532 ? "deposit" : "withdraw"));
  const [family, setFamily] = useState<BridgeFamily>("veMEZO");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeHistory, setBridgeHistory] = useState<BridgeHistoryEntry[]>([]);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);

  const testnetEnabled = environment === "testnet";
  const familyConfig = BRIDGE_FAMILY_CONFIG[family];
  const sourceChainId = sourceChainIdForMode(bridgeMode);
  const source = HORIZON_TESTNET[sourceChainId];
  const destination = getHorizonPeerChain(sourceChainId);
  const onSourceChain = chainId === sourceChainId;
  const isWithdraw = bridgeMode === "withdraw";

  useEffect(() => setBridgeHistory(address ? readBridgeHistory(address) : []), [address]);

  const vaultConfig = getContractConfig(31611, familyConfig.vaultContract);
  const id20Config = getContractConfig(31611, familyConfig.id20Contract);
  const peerConfig = getContractConfig(84532, familyConfig.peerContract);
  const ledgerConfig = getContractConfig(31611, "Ledger");
  const vaultAsset = (vaultConfig?.linkedData as { asset?: Address } | undefined)?.asset ?? null;
  const vaultToken = vaultConfig?.address as Address | undefined;
  const peerToken = peerConfig?.address as Address | undefined;
  const id20Token = (id20Config?.address as Address | undefined) ?? vaultAsset ?? undefined;

  const vaultBalance = useReadContract({
    chainId: 31611,
    address: vaultToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && vaultToken && isWithdraw) },
  });
  const peerBalance = useReadContract({
    chainId: 84532,
    address: peerToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && peerToken && !isWithdraw) },
  });

  const sources = useMemo(
    () =>
      buildBridgeSourceOptions({
        mode: bridgeMode,
        family,
        portfolio: portfolio.data,
        veCollections: walletPortfolio.data?.veCollections ?? {},
        ledgerAddress: ledgerConfig?.address as Address | undefined,
        vaultToken: vaultToken ?? null,
        vaultBalanceRaw: vaultBalance.data ?? 0n,
        peerToken: peerToken ?? null,
        peerBalanceRaw: peerBalance.data ?? 0n,
        id20Token: id20Token ?? null,
      }),
    [
      bridgeMode,
      family,
      portfolio.data,
      walletPortfolio.data?.veCollections,
      ledgerConfig?.address,
      vaultToken,
      vaultBalance.data,
      peerToken,
      peerBalance.data,
      id20Token,
    ],
  );

  const selectedSource = useMemo(
    () => resolveSelectedBridgeSource(sources, selectedSourceId),
    [sources, selectedSourceId],
  );

  useEffect(() => {
    if (!selectedSource) {
      if (selectedSourceId !== null) setSelectedSourceId(null);
      return;
    }
    if (selectedSource.id !== selectedSourceId) {
      setSelectedSourceId(selectedSource.id);
    }
  }, [selectedSource, selectedSourceId]);

  useEffect(() => {
    if (selectedSource?.kind === "venft" && selectedSource.balanceRaw > 0n) {
      setAmount(formatUnits(selectedSource.balanceRaw, selectedSource.decimals));
    }
  }, [selectedSource?.id, selectedSource?.kind, selectedSource?.balanceRaw, selectedSource?.decimals]);

  const maxAmount = amount.trim()
    ? (() => {
        try {
          return parseUnits(amount, selectedSource?.decimals ?? 18);
        } catch {
          return 0n;
        }
      })()
    : 0n;
  const maxRaw = selectedSource?.balanceRaw ?? 0n;
  const balanceLoading =
    isWithdraw
      ? Boolean(address && (vaultBalance.isPending || vaultBalance.isFetching || portfolio.isLoading || portfolio.isFetching))
      : Boolean(address && (peerBalance.isPending || peerBalance.isFetching));

  const canBridge = Boolean(
    onSourceChain &&
      selectedSource &&
      address &&
      walletClient &&
      publicClient &&
      maxAmount > 0n &&
      maxAmount <= maxRaw &&
      !busy,
  );

  const deliveryFeeQuery = useQuery({
    queryKey: ["horizon-ntt-delivery-fee", sourceChainId, familyConfig.asset],
    queryFn: () =>
      quoteHorizonNttDeliveryFee({
        asset: familyConfig.asset,
        sourceChainId,
        automatic: true,
      }),
    enabled: Boolean(testnetEnabled),
    staleTime: 30_000,
    retry: 1,
  });

  const historyQuery = useQuery({
    queryKey: [
      "horizon-bridge-history",
      address?.toLowerCase(),
      bridgeHistory.map((item) => item.sourceTransceiver.toLowerCase()).sort().join(","),
    ],
    queryFn: () => fetchWormholeOperations(bridgeHistory.map((item) => item.sourceTransceiver)),
    enabled: Boolean(address && bridgeHistory.length > 0),
    refetchInterval: bridgeHistory.length > 0 ? 20_000 : false,
    staleTime: 10_000,
  });

  const switchToSourceNetwork = async () => {
    await switchChainAsync({ chainId: sourceChainId });
    return true;
  };

  const selectBridgeMode = (mode: BridgeMode) => {
    if (mode === bridgeMode) return;
    setBridgeMode(mode);
    setSelectedSourceId(null);
    setAmount("");
    setNotice(null);
  };

  const selectFamily = (next: BridgeFamily) => {
    if (next === family) return;
    setFamily(next);
    setSelectedSourceId(null);
    setAmount("");
    setNotice(null);
  };

  const selectSource = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setAmount("");
    setNotice(null);
  };

  const setMaxAmount = () => {
    if (!selectedSource || selectedSource.balanceRaw <= 0n) return;
    setAmount(formatUnits(selectedSource.balanceRaw, selectedSource.decimals));
  };

  const resolveShareAmountForBridge = async (
    bridgeSource: BridgeSource,
    assetsOrShares: bigint,
    client: NonNullable<typeof publicClient>,
  ) => {
    if (bridgeSource.kind === "vault" || bridgeSource.kind === "peer") return assetsOrShares;
    if (!vaultConfig?.address || !vaultConfig.abi) {
      throw new Error("Horizon vault is not configured on Mezo.");
    }
    return client.readContract({
      address: vaultConfig.address as Address,
      abi: vaultConfig.abi as Abi,
      functionName: "previewDeposit",
      args: [assetsOrShares],
    }) as Promise<bigint>;
  };

  const buildBridgeSteps = (): TxStep[] => {
    if (!onSourceChain || !selectedSource || !address || !walletClient || !publicClient || !canBridge) {
      throw new Error(`Switch to ${source.name} and enter an amount within your selected balance.`);
    }
    setBusy(true);
    setNotice(null);

    const label =
      bridgeMode === "withdraw"
        ? `Withdraw ${familyConfig.vaultSymbol} to Base`
        : `Deposit ${familyConfig.peerSymbol} to Mezo`;

    const conversionSteps: TxStep[] = [];
    if (bridgeMode === "withdraw" && selectedSource.kind !== "vault") {
      if (!ledgerConfig?.address || !id20Token || !vaultConfig?.address || !vaultConfig.abi) {
        throw new Error("Horizon vault conversion contracts are not configured on Mezo.");
      }
      const conversionStep = makeBridgeVaultConversionStep({
        source: selectedSource,
        amount: maxAmount,
        account: address,
        family,
        contracts: {
          ledger: ledgerConfig.address as Address,
          id20: id20Token,
          vault: vaultConfig.address as Address,
          vaultAbi: vaultConfig.abi as Abi,
        },
        walletClient,
        chain: mezoTestnetChain,
      });
      if (conversionStep) conversionSteps.push(conversionStep);
    }

    const transferStep: TxStep = {
      type: "custom",
      key: "horizon-ntt-sdk-transfer",
      label,
      displayLabelBtn: true,
      run: async (ctx) => {
        const lifecycle = createTxNotificationLifecycle(label);
        const meta = await lifecycle.onPending?.({ key: "horizon-ntt-sdk-transfer", label, ctx });
        try {
          await lifecycle.onAwaitingWalletConfirmation?.({ key: "horizon-ntt-sdk-transfer", label, ctx, meta });
          const shareAmount = await resolveShareAmountForBridge(selectedSource, maxAmount, ctx.publicClient);
          if (shareAmount <= 0n) throw new Error("Bridge amount resolved to zero shares.");
          const result = await initiateHorizonNttTransfer({
            asset: familyConfig.asset,
            amount: shareAmount,
            sourceChainId,
            account: ctx.account,
            walletClient,
            publicClient: ctx.publicClient,
            automatic: true,
            onUnsignedTx: async (description) => {
              if (description.toLowerCase().includes("approve")) {
                notify?.info(
                  "Approve bridge spending",
                  `Confirm the ${familyConfig.vaultSymbol} allowance for the NTT manager.`,
                );
              } else {
                notify?.info("Confirm transfer", `Sign the Wormhole NTT transfer to ${destination.name}.`);
              }
            },
          });
          setBridgeHistory(
            saveBridgeHistoryEntry({
              id: `${result.sourceChainId}:${result.sourceTxHash.toLowerCase()}`,
              account: ctx.account,
              sourceTxHash: result.sourceTxHash,
              sourceTransceiver: result.sourceTransceiver,
              sourceChainId: result.sourceChainId,
              destinationChainId: result.destinationChainId,
              sourceName: result.sourceName,
              destinationName: result.destinationName,
              symbol: familyConfig.vaultSymbol,
              amount: formatUnits(shareAmount, 18),
              submittedAt: Date.now(),
            }),
          );
          await lifecycle.onTransactionSubmitted?.({
            key: "horizon-ntt-sdk-transfer",
            label,
            ctx,
            hash: result.sourceTxHash,
            meta,
          });
          const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash: result.sourceTxHash });
          await lifecycle.onTransactionConfirmed?.({
            key: "horizon-ntt-sdk-transfer",
            label,
            ctx,
            hash: result.sourceTxHash,
            receipt,
            meta,
          });
          return { hash: result.sourceTxHash, receipt };
        } catch (error) {
          await lifecycle.onTransactionFailed?.({
            key: "horizon-ntt-sdk-transfer",
            label,
            ctx,
            error,
            message: getParsedError(error),
            meta,
          });
          throw error;
        }
      },
    };

    return [...conversionSteps, transferStep];
  };

  const onFlowComplete = async (message: string) => {
    setBusy(false);
    setAmount("");
    setNotice({ tone: "success", message });
    notify?.success("Horizon transaction confirmed", message);
    await Promise.all([
      vaultBalance.refetch(),
      peerBalance.refetch(),
      portfolio.domains.wallet.refetch(),
      portfolio.domains.tranches.refetch(),
      portfolio.domains.id20.refetch(),
    ]);
  };

  const onFlowError = (message: string) => {
    setBusy(false);
    setNotice({ tone: "error", message });
  };

  const bridgeActionLabel = isWithdraw ? "Withdraw to Base" : "Deposit to Mezo";
  const connectedNetworkLabel =
    chainId === 31611
      ? HORIZON_TESTNET[31611].name
      : chainId === 84532
        ? HORIZON_TESTNET[84532].name
        : "Unsupported network";

  if (!testnetEnabled) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Horizon bridge</CardTitle>
            <CardDescription>
              The Mezo ↔ Base Sepolia NTT deployment is available on testnet. Mainnet bridge contracts are not
              configured yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Horizon · Testnet</Badge>
          <Badge className="normal-case tracking-normal">Mezo Testnet ↔ Base Sepolia</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Move your Aurove position across chains</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">
          Deposit brings vault peer tokens from Base onto Mezo. Withdraw converts a Mezo balance into vault shares and
          sends them to Base. veNFTs and Ledger positions remain on Mezo; Horizon bridges the ERC-4626 vault share.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{isWithdraw ? "Withdraw to Base" : "Deposit to Mezo"}</CardTitle>
                <CardDescription className="mt-1">
                  {isWithdraw
                    ? "Bridge from Mezo Testnet to Base Sepolia."
                    : "Bridge from Base Sepolia to Mezo Testnet."}
                </CardDescription>
              </div>
              <Waypoints className="h-5 w-5 text-[var(--accent)]" />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className="grid grid-cols-2 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-1"
              role="tablist"
              aria-label="Bridge direction"
            >
              {bridgeModeOptions.map((optionItem) => {
                const selected = bridgeMode === optionItem.id;
                return (
                  <button
                    key={optionItem.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => selectBridgeMode(optionItem.id)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                      selected ? "bg-foreground/10 text-foreground shadow-sm" : "text-muted hover:text-foreground/80",
                    )}
                  >
                    {optionItem.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Bridge asset">
              {familyOptions.map((optionItem) => {
                const selected = family === optionItem.id;
                return (
                  <button
                    key={optionItem.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => selectFamily(optionItem.id)}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                      selected
                        ? "border-[var(--accent)]/70 bg-[var(--accent)]/14 text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
                        : "border-foreground/10 bg-foreground/[0.02] text-foreground/72 hover:border-foreground/15 hover:bg-foreground/[0.05]",
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                      <Image
                        src={optionItem.icon}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 object-contain"
                        aria-hidden="true"
                      />
                    </span>
                    <span>{optionItem.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-foreground/[0.025] p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Connected network</span>
                <span className={onSourceChain ? undefined : "text-amber-800 dark:text-amber-200"}>
                  {connectedNetworkLabel}
                </span>
              </div>
              <div className="my-3 flex items-center justify-center gap-3 text-sm font-medium">
                <span>{source.name}</span>
                <ArrowLeftRight className="h-4 w-4 text-muted" />
                <span>{destination.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Wallet</span>
                <span>{shortAddress(address)}</span>
              </div>
            </div>

            <BridgeTokenInput
              id="horizon-amount"
              actionLabel={isWithdraw ? "Withdraw" : "Deposit"}
              amount={amount}
              selectedSource={selectedSource}
              sources={sources}
              balanceLabel={
                balanceLoading
                  ? "Loading…"
                  : formatCompactRawTokenAmount(
                      selectedSource?.balanceRaw,
                      selectedSource?.decimals ?? 18,
                      selectedSource?.symbol ?? null,
                    )
              }
              networkLabel={source.name}
              loading={balanceLoading}
              disabled={busy}
              amountReadOnly={selectedSource?.kind === "venft"}
              insufficientBalance={maxAmount > 0n && maxAmount > maxRaw}
              canMax={Boolean(selectedSource && selectedSource.balanceRaw > 0n && !balanceLoading)}
              isEditing={amountFocused || amount.trim().length > 0}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onAmountChange={(value) => setAmount(normalizeAmountInput(value))}
              onMax={setMaxAmount}
              onSelectSource={selectSource}
            />
            {isWithdraw && (vaultBalance.isError || portfolio.domains.id20.isError) ? (
              <p role="alert" className="text-xs text-red-700 dark:text-red-200">
                Could not read one or more Mezo balances. Switch to {source.name} or retry.
              </p>
            ) : null}
            {!isWithdraw && peerBalance.isError ? (
              <p role="alert" className="text-xs text-red-700 dark:text-red-200">
                Could not read your {familyConfig.peerSymbol} peer balance on Base Sepolia.
              </p>
            ) : null}

            {deliveryFeeQuery.data !== undefined ? (
              <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-muted">
                <span>Wormhole delivery quote</span>
                <span className="font-medium text-foreground">
                  {deliveryFeeQuery.data === 0n
                    ? "Covered by relay"
                    : `${formatEther(deliveryFeeQuery.data)} ${source.side === "hub" ? "BTC" : "ETH"}`}
                </span>
              </div>
            ) : null}
            {deliveryFeeQuery.isError ? (
              <p role="status" className="text-xs text-muted">
                Could not quote delivery yet. The SDK will refresh the fee when you bridge.
              </p>
            ) : null}

            {!onSourceChain ? (
              <Button className="w-full" onClick={() => void switchToSourceNetwork()}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Switch to {source.name}
              </Button>
            ) : (
              <TransactionFlowButton
                className="w-full"
                disabled={!canBridge || !isConnected}
                steps={buildBridgeSteps}
                onComplete={() =>
                  void onFlowComplete(
                    `${familyConfig.vaultSymbol} transfer confirmed. Wormhole delivery will send the peer token to ${shortAddress(address)} on ${destination.name}.`,
                  )
                }
                onError={onFlowError}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                {bridgeActionLabel}
              </TransactionFlowButton>
            )}
            <p className="text-center text-xs leading-5 text-muted">
              {isWithdraw
                ? `Withdraw batches the selected ${family} balance into ${familyConfig.vaultSymbol} when needed, then relays to ${destination.name}.`
                : `Deposit uses Wormhole NTT from Base and relays ${familyConfig.peerSymbol} to the same wallet on ${destination.name}.`}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {isWithdraw ? (
            <Card>
              <CardHeader>
                <CardTitle>Withdraw path</CardTitle>
                <CardDescription>
                  Pick a variant in the amount field. Non-vault balances are batched into vault shares on Mezo before the
                  Base transfer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <p className="leading-5">Vault shares bridge directly.</p>
                </div>
                <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-muted" />
                  <p className="leading-5">
                    ID20, liquid tranche, and veNFT paths batch into one convert step (EIP-5792 when the wallet supports
                    it; otherwise sequential calls), then bridge.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>After deposit arrives on Mezo</CardTitle>
                <CardDescription>Finish the exit once peer tokens land on Mezo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <p className="text-sm leading-5">NTT returns the peer balance to the Mezo vault share token.</p>
                </div>
                <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3">
                  <ArrowDownToLine className="mt-0.5 h-4 w-4 text-muted" />
                  <p className="text-sm leading-5">
                    Redeem vault shares to ID20, unwrap to Ledger units, then redeem your position.
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/earn">Open Earn positions</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Position exit path</CardTitle>
              <CardDescription>Redeem in order to preserve the position backing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2">
                <span>1 · Deposit peer back to Mezo</span>
                <span className="text-xs text-muted">{isWithdraw ? "Switch to Deposit" : "Current step"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2">
                <span>2 · Redeem vault shares to ID20</span>
                <span className="text-xs text-muted">Mezo only</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2">
                <span>3 · Unwrap ID20 to Ledger units</span>
                <span className="text-xs text-muted">Earn page</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2">
                <span>4 · Redeem Ledger units to veNFT</span>
                <span className="text-xs text-muted">Earn page</span>
              </div>
              <Button asChild className="w-full" variant="outline">
                <Link href="/earn">View Ledger and ID20 positions</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Bridge history</CardTitle>
              <CardDescription className="mt-1">Track transfers sent from this wallet through Wormhole.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void historyQuery.refetch()}
              disabled={!bridgeHistory.length || historyQuery.isFetching}
              aria-label="Refresh bridge history"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!address ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-muted">
              Connect the wallet used to bridge to see its history.
            </p>
          ) : bridgeHistory.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-muted">
              Your bridge transfers will appear here after you send one.
            </p>
          ) : (
            <div className="space-y-3">
              {bridgeHistory.map((entry) => {
                const operation = findWormholeOperation(historyQuery.data, entry.sourceTxHash);
                const status = getWormholeOperationStatus(operation);
                const targetHash = operation?.targetChain?.transaction?.txHash;
                return (
                  <div key={entry.id} className="rounded-xl border border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {entry.amount} {entry.symbol}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {entry.sourceName} <ArrowLeftRight className="mx-1 inline h-3 w-3" /> {entry.destinationName} ·{" "}
                          {new Date(entry.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        className={
                          status === "Completed"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : ""
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                      <a
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                        href={getChainTxUrl(entry.sourceChainId, entry.sourceTxHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source transaction <ExternalLink className="h-3 w-3" />
                      </a>
                      {targetHash ? (
                        <a
                          className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                          href={getChainTxUrl(entry.destinationChainId, targetHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Destination transaction <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      <a
                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                        href={getWormholeTxUrl(entry.sourceTxHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on Wormholescan <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
              {historyQuery.isError ? (
                <p role="status" className="text-xs text-muted">
                  Wormholescan could not be reached. Your saved transactions are still available; try refreshing shortly.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {notice ? (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm leading-6 ${
            notice.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : notice.tone === "error"
                ? "border-red-500/30 bg-red-500/10"
                : "border-[var(--line)]"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
        <ShieldCheck className="h-4 w-4" />
        Horizon contracts are configured on testnet.{" "}
        <span>
          {selectedSource && "token" in selectedSource
            ? `Current token ${shortAddress(selectedSource.token)}`
            : "Connect on Mezo or Base Sepolia to load contracts."}
        </span>
        {vaultAsset ? <span>· Vault asset {shortAddress(vaultAsset)}</span> : null}
      </div>
    </div>
  );
}
