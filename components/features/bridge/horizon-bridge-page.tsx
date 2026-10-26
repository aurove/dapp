"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, ExternalLink, RefreshCw, ShieldCheck, Waypoints } from "lucide-react";
import { erc20Abi, formatEther, formatUnits, parseUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { baseSepoliaChain, getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { HORIZON_TESTNET, type HorizonBridgeAsset, type HorizonNativeChainId } from "@/lib/bridge/horizon";
import { initiateHorizonNttTransfer, quoteHorizonNttDeliveryFee } from "@/lib/bridge/ntt-transfer";
import { BridgeTokenInput } from "@/components/features/bridge/bridge-token-input";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeTokenApprovalStep, type TxStep } from "@/lib/tx-flow";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";
import { fetchWormholeOperations, findWormholeOperation, getChainTxUrl, getWormholeOperationStatus, getWormholeTxUrl, readBridgeHistory, saveBridgeHistoryEntry, type BridgeHistoryEntry } from "@/lib/bridge/wormholescan";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";

const assetOptions: Array<{ key: HorizonBridgeAsset; symbol: string; label: string; vault: "avBTCVault" | "avMEZOVault"; peer: "avBTCvPeer" | "avMEZOvPeer"; id20: "avBTCmId20" | "avMEZOmId20" }> = [
  { key: "avBTCv", symbol: "avBTCv", label: "Bitcoin Vault", vault: "avBTCVault", peer: "avBTCvPeer", id20: "avBTCmId20" },
  { key: "avMEZOv", symbol: "avMEZOv", label: "MEZO Vault", vault: "avMEZOVault", peer: "avMEZOvPeer", id20: "avMEZOmId20" },
];

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

function formatTokenAmount(value: bigint | undefined, decimals = 18) {
  if (value === undefined) return "—";
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  return Number.isFinite(num) ? num.toLocaleString(undefined, { maximumFractionDigits: 6 }) : formatted;
}

function normalizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");
  if (fractions.length === 0) return whole;
  return `${whole}.${fractions.join("").slice(0, 18)}`;
}

export function HorizonBridgePage() {
  const environment = resolveAppEnvironment();
  const configuredChain = getActiveChain(environment);
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { notify } = useTxFlowRuntime();
  const [selectedAsset, setSelectedAsset] = useState<HorizonBridgeAsset>("avBTCv");
  const [amount, setAmount] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeHistory, setBridgeHistory] = useState<BridgeHistoryEntry[]>([]);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const testnetEnabled = environment === "testnet";
  useEffect(() => setBridgeHistory(address ? readBridgeHistory(address) : []), [address]);
  const source = chainId === 84532 ? HORIZON_TESTNET[84532] : chainId === 31611 ? HORIZON_TESTNET[31611] : null;
  const destination = chainId === 84532 ? HORIZON_TESTNET[31611] : HORIZON_TESTNET[84532];
  const option = assetOptions.find((item) => item.key === selectedAsset)!;
  const assetContractName = source?.side === "spoke" ? option.peer : option.vault;
  const tokenConfig = source ? getContractConfig(chainId, assetContractName) : null;
  const vaultConfig = chainId === 31611 ? getContractConfig(chainId, option.vault) : null;
  const id20Config = chainId === 31611 ? getContractConfig(chainId, option.id20) : null;
  const vaultAsset = (vaultConfig?.linkedData as { asset?: Address } | undefined)?.asset ?? null;
  const maxAmount = amount.trim() ? (() => { try { return parseUnits(amount, 18); } catch { return 0n; } })() : 0n;
  const shareBalance = useReadContract({
    chainId,
    address: tokenConfig?.address as Address | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && tokenConfig?.address && source) },
  });
  const id20Balance = useReadContract({
    chainId: 31611,
    address: id20Config?.address as Address | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && id20Config?.address && chainId === 31611) },
  });
  const maxRaw = shareBalance.data ?? 0n;
  const canBridge = Boolean(source && tokenConfig?.address && address && walletClient && publicClient && maxAmount > 0n && maxAmount <= maxRaw && !busy);
  const expectedChain = configuredChain.id;
  const deliveryFeeQuery = useQuery({
    queryKey: ["horizon-ntt-delivery-fee", chainId, selectedAsset],
    queryFn: () => quoteHorizonNttDeliveryFee({
      asset: selectedAsset,
      sourceChainId: chainId as HorizonNativeChainId,
      automatic: true,
    }),
    enabled: Boolean(source && testnetEnabled),
    staleTime: 30_000,
    retry: 1,
  });
  const historyQuery = useQuery({
    queryKey: ["horizon-bridge-history", address?.toLowerCase(), bridgeHistory.map((item) => item.sourceTransceiver.toLowerCase()).sort().join(",")],
    queryFn: () => fetchWormholeOperations(bridgeHistory.map((item) => item.sourceTransceiver)),
    enabled: Boolean(address && bridgeHistory.length > 0),
    refetchInterval: bridgeHistory.length > 0 ? 20_000 : false,
    staleTime: 10_000,
  });

  const ensureSupportedBridgeNetwork = async () => {
    if (!source) {
      await switchChainAsync({ chainId: expectedChain });
      return false;
    }
    return true;
  };

  const switchBridgeNetwork = async () => {
    if (!source) return ensureSupportedBridgeNetwork();
    await switchChainAsync({ chainId: source.side === "hub" ? baseSepoliaChain.id : 31611 });
    return true;
  };

  const setMaxShareAmount = async () => {
    const result = await shareBalance.refetch();
    const balance = result.data ?? shareBalance.data;
    if (balance !== undefined) setAmount(formatUnits(balance, 18));
  };

  const setMaxId20Amount = async () => {
    const result = await id20Balance.refetch();
    const balance = result.data ?? id20Balance.data;
    if (balance !== undefined) setAmount(formatUnits(balance, 18));
  };

  const buildBridgeSteps = (): TxStep[] => {
    if (!source || !tokenConfig?.address || !address || !walletClient || !publicClient || !canBridge) {
      throw new Error(`Enter an amount within your ${option.symbol} balance.`);
    }
    setBusy(true);
    setNotice(null);
    const label = source.side === "hub" ? `Bridge ${option.symbol} to Base` : `Return ${option.symbol} to Mezo`;
    return [
      {
        type: "custom",
        key: "horizon-ntt-sdk-transfer",
        label,
        displayLabelBtn: true,
        run: async (ctx) => {
          const lifecycle = createTxNotificationLifecycle(label);
          const meta = await lifecycle.onPending?.({ key: "horizon-ntt-sdk-transfer", label, ctx });
          try {
            await lifecycle.onAwaitingWalletConfirmation?.({ key: "horizon-ntt-sdk-transfer", label, ctx, meta });
            const result = await initiateHorizonNttTransfer({
              asset: selectedAsset,
              amount: maxAmount,
              sourceChainId: chainId as HorizonNativeChainId,
              account: ctx.account,
              walletClient,
              publicClient: ctx.publicClient,
              automatic: true,
              onUnsignedTx: async (description) => {
                if (description.toLowerCase().includes("approve")) {
                  notify?.info("Approve bridge spending", `Confirm the ${option.symbol} allowance for the NTT manager.`);
                } else {
                  notify?.info("Confirm transfer", `Sign the Wormhole NTT transfer to ${destination.name}.`);
                }
              },
            });
            setBridgeHistory(saveBridgeHistoryEntry({
              id: `${result.sourceChainId}:${result.sourceTxHash.toLowerCase()}`,
              account: ctx.account,
              sourceTxHash: result.sourceTxHash,
              sourceTransceiver: result.sourceTransceiver,
              sourceChainId: result.sourceChainId,
              destinationChainId: result.destinationChainId,
              sourceName: result.sourceName,
              destinationName: result.destinationName,
              symbol: option.symbol,
              amount: formatUnits(maxAmount, 18),
              submittedAt: Date.now(),
            }));
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
      },
    ];
  };

  const buildVaultSteps = (action: "deposit" | "redeem"): TxStep[] => {
    if (!address || !vaultConfig?.address || !vaultConfig.abi || !id20Config?.address || maxAmount <= 0n) {
      throw new Error("Connect on Mezo and enter a valid amount.");
    }
    if (action === "deposit" && maxAmount > (id20Balance.data ?? 0n)) {
      throw new Error(`Amount exceeds your ${option.id20} balance.`);
    }
    if (action === "redeem" && maxAmount > (shareBalance.data ?? 0n)) {
      throw new Error(`Amount exceeds your ${option.symbol} balance.`);
    }
    setBusy(true);
    setNotice(null);
    const steps: TxStep[] = [];
    if (action === "deposit") {
      steps.push(makeTokenApprovalStep({
        key: "approve-vault-deposit",
        label: `Approve ${option.id20}`,
        displayLabelBtn: true,
        approval: { standard: "erc20", token: id20Config.address as Address, spender: vaultConfig.address as Address, amount: maxAmount },
      }) as unknown as TxStep);
      steps.push(makeAddressWriteStep({
        key: "deposit-id20-vault",
        label: `Deposit ${option.id20} into ${option.symbol}`,
        displayLabelBtn: true,
        address: vaultConfig.address as Address,
        abi: vaultConfig.abi as Abi,
        variables: { functionName: "deposit", args: [maxAmount, address] },
      }) as unknown as TxStep);
    } else {
      steps.push(makeAddressWriteStep({
        key: "redeem-vault-shares",
        label: `Withdraw ${option.symbol} to ${option.id20}`,
        displayLabelBtn: true,
        address: vaultConfig.address as Address,
        abi: vaultConfig.abi as Abi,
        variables: { functionName: "redeem", args: [maxAmount, address, address] },
      }) as unknown as TxStep);
    }
    return steps;
  };

  const onFlowComplete = async (message: string) => {
    setBusy(false);
    setAmount("");
    setNotice({ tone: "success", message });
    notify?.success("Horizon transaction confirmed", message);
    await Promise.all([shareBalance.refetch(), id20Balance.refetch()]);
  };

  const onFlowError = (message: string) => {
    setBusy(false);
    setNotice({ tone: "error", message });
  };

  const isMezo = chainId === 31611;
  const bridgeActionLabel = source?.side === "spoke" ? "Return to Mezo" : "Bridge to Base";

  if (!testnetEnabled) {
    return <div className="mx-auto max-w-4xl"><Card><CardHeader><CardTitle>Horizon bridge</CardTitle><CardDescription>The Mezo ↔ Base Sepolia NTT deployment is available on testnet. Mainnet bridge contracts are not configured yet.</CardDescription></CardHeader></Card></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Badge>Horizon · Testnet</Badge><Badge className="normal-case tracking-normal">Mezo Testnet ↔ Base Sepolia</Badge></div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Move your Aurove position across chains</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">Carry fungible vault shares to Base, then return them to Mezo to withdraw back through ID20 and Ledger. veNFTs and Ledger positions remain on Mezo; Horizon bridges the ERC-4626 vault share.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{source?.side === "spoke" ? "Return vault peer" : "Bridge vault shares"}</CardTitle><CardDescription className="mt-1">Choose an asset and amount for the connected chain.</CardDescription></div><Waypoints className="h-5 w-5 text-[var(--accent)]" /></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-[var(--line)] bg-foreground/[0.025] p-4">
              <div className="flex items-center justify-between text-xs text-muted"><span>Connected network</span><span>{source?.name ?? "Unsupported network"}</span></div>
              <div className="my-3 flex items-center justify-center gap-3 text-sm font-medium"><span>{source?.name ?? "Mezo Testnet"}</span><ArrowLeftRight className="h-4 w-4 text-muted" /><span>{destination.name}</span></div>
              <div className="flex items-center justify-between text-xs text-muted"><span>Wallet</span><span>{shortAddress(address)}</span></div>
            </div>

            {isMezo ? <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--line)] p-3"><p className="text-xs text-muted">{option.id20} available to deposit</p><p className="mt-1 text-lg font-semibold">{formatTokenAmount(id20Balance.data)}</p></div>
              <div className="rounded-xl border border-[var(--line)] p-3"><p className="text-xs text-muted">{option.symbol} available to bridge</p><p className="mt-1 text-lg font-semibold">{formatTokenAmount(shareBalance.data)}</p></div>
            </div> : <div className="rounded-xl border border-[var(--line)] p-3"><p className="text-xs text-muted">{option.symbol} peer available to return</p><p className="mt-1 text-lg font-semibold">{formatTokenAmount(shareBalance.data)}</p></div>}

            <BridgeTokenInput
              id="horizon-amount"
              actionLabel={source?.side === "spoke" ? "Return" : "Bridge"}
              amount={amount}
              selectedToken={option}
              tokens={assetOptions}
              balanceLabel={
                shareBalance.data === undefined && (shareBalance.isPending || shareBalance.isFetching)
                  ? "Loading…"
                  : formatCompactRawTokenAmount(shareBalance.data, 18, option.symbol)
              }
              networkLabel={source?.name ?? "Unsupported network"}
              loading={Boolean(address && tokenConfig?.address && (shareBalance.isPending || shareBalance.isFetching))}
              disabled={busy}
              insufficientBalance={maxAmount > 0n && maxAmount > maxRaw}
              canMax={Boolean(address && tokenConfig?.address && maxRaw > 0n && !shareBalance.isPending && !shareBalance.isFetching)}
              isEditing={amountFocused || amount.trim().length > 0}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              onAmountChange={(value) => setAmount(normalizeAmountInput(value))}
              onMax={() => void setMaxShareAmount()}
              onSelectToken={(key) => {
                setSelectedAsset(key);
                setAmount("");
              }}
            />
            {shareBalance.isError ? <p role="alert" className="text-xs text-red-700 dark:text-red-200">Could not read your {option.symbol} balance. Switch to the source network or retry the balance request.</p> : null}

            {source && deliveryFeeQuery.data !== undefined ? (
              <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-xs text-muted">
                <span>Wormhole delivery quote</span>
                <span className="font-medium text-foreground">
                  {deliveryFeeQuery.data === 0n ? "Covered by relay" : `${formatEther(deliveryFeeQuery.data)} ${source.side === "hub" ? "BTC" : "ETH"}`}
                </span>
              </div>
            ) : null}
            {source && deliveryFeeQuery.isError ? (
              <p role="status" className="text-xs text-muted">Could not quote delivery yet. The SDK will refresh the fee when you bridge.</p>
            ) : null}
            {!source ? <Button className="w-full" onClick={() => void ensureSupportedBridgeNetwork()}><ArrowLeftRight className="mr-2 h-4 w-4" />Switch to Mezo Testnet</Button> : <TransactionFlowButton className="w-full" disabled={!canBridge || !isConnected} steps={buildBridgeSteps} onComplete={() => void onFlowComplete(`${option.symbol} transfer confirmed. Wormhole delivery will send the peer token to ${shortAddress(address)} on ${destination.name}.`)} onError={onFlowError}><ArrowUpRight className="mr-2 h-4 w-4" />{bridgeActionLabel}</TransactionFlowButton>}
            {source ? <Button className="w-full" variant="ghost" size="sm" disabled={busy} onClick={() => void switchBridgeNetwork()}>Switch wallet to {source.side === "hub" ? "Base Sepolia to return a peer" : "Mezo Testnet to withdraw"}</Button> : null}
            <p className="text-center text-xs leading-5 text-muted">Bridging uses the Wormhole TypeScript SDK NTT protocol: it quotes delivery, approves the manager when needed, and starts automatic relay to the same wallet on {destination.name}.</p>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {isMezo ? <Card>
            <CardHeader><CardTitle>Deposit or withdraw vault shares</CardTitle><CardDescription>Manage avBTCv / avMEZOv directly on Mezo.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <TransactionFlowButton className="w-full" variant="secondary" disabled={!isConnected || !vaultAsset || !id20Balance.data || id20Balance.data <= 0n || busy || maxAmount <= 0n} steps={() => buildVaultSteps("deposit")} onComplete={() => void onFlowComplete(`Deposited ${option.id20} into ${option.symbol}. You can now bridge your vault shares to Base.`)} onError={onFlowError}><ArrowUpRight className="mr-2 h-4 w-4" />Deposit ID20 into {option.symbol}</TransactionFlowButton>
              <Button type="button" className="w-full" variant="ghost" size="sm" disabled={!address || id20Balance.isPending || id20Balance.isFetching || !id20Balance.data || id20Balance.data <= 0n} onClick={() => void setMaxId20Amount()}>{id20Balance.isFetching ? "Loading ID20 balance…" : "Set amount to max ID20"}</Button>
              {id20Balance.isError ? <p role="alert" className="text-xs text-red-700 dark:text-red-200">Could not read your {option.id20} balance. Retry after confirming Mezo Testnet is selected.</p> : null}
              <TransactionFlowButton className="w-full" variant="outline" disabled={!isConnected || !shareBalance.data || shareBalance.data <= 0n || busy || maxAmount <= 0n} steps={() => buildVaultSteps("redeem")} onComplete={() => void onFlowComplete(`Redeemed ${option.symbol} into ${option.id20}. Use the position tools below to unwrap ID20 and redeem Ledger units back to your veNFT.`)} onError={onFlowError}><ArrowDownToLine className="mr-2 h-4 w-4" />Withdraw {option.symbol} to ID20</TransactionFlowButton>
              <p className="text-xs leading-5 text-muted">Both actions use the same amount field. Depositing creates vault shares; withdrawing redeems the selected shares back into ID20.</p>
            </CardContent>
          </Card> : <Card>
            <CardHeader><CardTitle>After the return transfer</CardTitle><CardDescription>Finish the exit on Mezo once the peer tokens arrive.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3"><Check className="mt-0.5 h-4 w-4 text-emerald-500" /><p className="text-sm leading-5">NTT returns the peer balance to the Mezo vault share token.</p></div>
              <div className="flex gap-3 rounded-xl border border-[var(--line)] p-3"><ArrowDownToLine className="mt-0.5 h-4 w-4 text-muted" /><p className="text-sm leading-5">Redeem vault shares to ID20, unwrap to Ledger units, then redeem your position.</p></div>
              <Button asChild variant="outline" className="w-full"><Link href="/earn">Open Earn positions</Link></Button>
            </CardContent>
          </Card>}

          <Card>
            <CardHeader><CardTitle>Position exit path</CardTitle><CardDescription>Redeem in order to preserve the position backing.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2"><span>1 · Bridge peer back to Mezo</span><span className="text-xs text-muted">{isMezo ? "Switch to Base to return" : "Current step"}</span></div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2"><span>2 · Redeem vault shares to ID20</span><span className="text-xs text-muted">Mezo only</span></div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2"><span>3 · Unwrap ID20 to Ledger units</span><span className="text-xs text-muted">Earn page</span></div>
              <div className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2"><span>4 · Redeem Ledger units to veNFT</span><span className="text-xs text-muted">Earn page</span></div>
              <Button asChild className="w-full" variant="outline"><Link href="/earn">View Ledger and ID20 positions</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle>Bridge history</CardTitle><CardDescription className="mt-1">Track transfers sent from this wallet through Wormhole.</CardDescription></div>
            <Button type="button" variant="outline" size="sm" onClick={() => void historyQuery.refetch()} disabled={!bridgeHistory.length || historyQuery.isFetching} aria-label="Refresh bridge history"><RefreshCw className={`mr-2 h-4 w-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {!address ? <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-muted">Connect the wallet used to bridge to see its history.</p> : bridgeHistory.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-muted">Your bridge transfers will appear here after you send one.</p> : <div className="space-y-3">
            {bridgeHistory.map((entry) => {
              const operation = findWormholeOperation(historyQuery.data, entry.sourceTxHash);
              const status = getWormholeOperationStatus(operation);
              const targetHash = operation?.targetChain?.transaction?.txHash;
              return <div key={entry.id} className="rounded-xl border border-[var(--line)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{entry.amount} {entry.symbol}</p><p className="mt-1 text-xs text-muted">{entry.sourceName} <ArrowLeftRight className="mx-1 inline h-3 w-3" /> {entry.destinationName} · {new Date(entry.submittedAt).toLocaleString()}</p></div><Badge className={status === "Completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}>{status}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"><a className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline" href={getChainTxUrl(entry.sourceChainId, entry.sourceTxHash)} target="_blank" rel="noreferrer">Source transaction <ExternalLink className="h-3 w-3" /></a>{targetHash ? <a className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline" href={getChainTxUrl(entry.destinationChainId, targetHash)} target="_blank" rel="noreferrer">Destination transaction <ExternalLink className="h-3 w-3" /></a> : null}<a className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline" href={getWormholeTxUrl(entry.sourceTxHash)} target="_blank" rel="noreferrer">View on Wormholescan <ExternalLink className="h-3 w-3" /></a></div>
              </div>;
            })}
            {historyQuery.isError ? <p role="status" className="text-xs text-muted">Wormholescan could not be reached. Your saved transactions are still available; try refreshing shortly.</p> : null}
          </div>}
        </CardContent>
      </Card>

      {notice ? <div role="status" className={`rounded-xl border p-4 text-sm leading-6 ${notice.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10" : notice.tone === "error" ? "border-red-500/30 bg-red-500/10" : "border-[var(--line)]"}`}>{notice.message}</div> : null}

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4" />Horizon contracts are configured on testnet. <span>{tokenConfig?.address ? `Current token ${shortAddress(tokenConfig.address)}` : "Connect on Mezo or Base Sepolia to load contracts."}</span>{vaultAsset ? <span>· Vault asset {shortAddress(vaultAsset)}</span> : null}</div>
    </div>
  );
}
