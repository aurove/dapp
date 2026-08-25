"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { AlertTriangle, CheckCircle2, Gift, Loader2 } from "lucide-react";
import { formatUnits, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@ui";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { FeatureStatusPanel } from "@/components/features/shared/page-shell";
import {
  resolveGaugeIncentiveTarget,
  type AuroveLiquidityPair,
  type GaugeIncentiveTarget,
} from "@/lib/config/supported-liquidity-pools";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import { validateGaugeIncentiveInput } from "./gauge-incentive-model";
import { useGaugeIncentiveData } from "./use-gauge-incentive-data";
import { useGaugeIncentiveTransaction } from "./use-gauge-incentive-transaction";

function shortAddress(address: Address) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatEpochTime(timestamp: bigint) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(Number(timestamp) * 1_000));
}

function normalizeAmountInput(value: string, decimals: number) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");
  if (fractions.length === 0) return whole;
  return `${whole}.${fractions.join("").slice(0, decimals)}`;
}

function BoundTarget({ target }: { target: GaugeIncentiveTarget }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
          Selected pair
        </p>
        <p className="mt-1 font-medium text-white">{target.pair.pairLabel}</p>
        <code className="mt-1 block truncate text-xs text-white/45" title={target.poolAddress}>
          Pool {shortAddress(target.poolAddress)}
        </code>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
          Selected gauge
        </p>
        <p className="mt-1 font-medium text-white">CL voting gauge</p>
        <code className="mt-1 block truncate text-xs text-white/45" title={target.gaugeAddress}>
          {shortAddress(target.gaugeAddress)}
        </code>
      </div>
    </div>
  );
}

function GaugeIncentiveModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GaugeIncentiveTarget;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const { address } = useAccount();
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address | null>(null);
  const [amount, setAmount] = useState("");
  const dataQuery = useGaugeIncentiveData(props.target, props.open);
  const transaction = useGaugeIncentiveTransaction(props.target);
  const tokens = useMemo(() => dataQuery.data?.tokens ?? [], [dataQuery.data?.tokens]);

  const selectedToken = useMemo(
    () =>
      tokens.find((token) => token.address.toLowerCase() === selectedTokenAddress?.toLowerCase()) ??
      tokens[0] ??
      null,
    [selectedTokenAddress, tokens],
  );
  const gaugeAvailable = dataQuery.data?.available === true;
  const validation = validateGaugeIncentiveInput({
    amount,
    decimals: selectedToken?.decimals ?? 18,
    balance: selectedToken?.balance ?? null,
    allowance: selectedToken?.allowance ?? null,
    connected: Boolean(address),
    tokenSupported: Boolean(selectedToken),
    gaugeAvailable,
  });
  const queryError = dataQuery.error ? getParsedError(dataQuery.error) : null;
  const unavailableReason = dataQuery.data?.unavailableReason ?? queryError;
  const epochStart = dataQuery.data?.epochStart ?? null;
  const epochClosesAt = dataQuery.data?.epochClosesAt ?? null;
  const actionParams =
    selectedToken && validation.amountRaw && epochStart !== null
      ? {
          tokenAddress: selectedToken.address,
          amount: validation.amountRaw,
          expectedEpochStart: epochStart,
        }
      : null;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && transaction.isPending) return;
        props.onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto border-white/12 bg-[#0d1218] p-4 sm:w-[calc(100vw-2rem)] sm:p-6"
        onPointerDownOutside={(event) => {
          if (transaction.isPending) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          props.returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl">Incentivise gauge</DialogTitle>
          <DialogDescription>
            Add voting incentives to this pair&apos;s current Mezo epoch. The pool, gauge, and
            voting-reward recipient are fixed by the route.
          </DialogDescription>
        </DialogHeader>

        <BoundTarget target={props.target} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Current incentive epoch
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {epochStart === null ? "Loading…" : formatEpochTime(epochStart)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              Closes
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {epochClosesAt === null ? "Loading…" : formatEpochTime(epochClosesAt)}
            </p>
          </div>
        </div>

        {dataQuery.isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-5 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading gauge incentives and supported tokens…
          </div>
        ) : unavailableReason ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-50/90"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{unavailableReason}</p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium text-white">Supported incentive token</label>
            <span className="text-xs text-white/45">
              Filtered by the Mezo voter and voting-reward contract
            </span>
          </div>
          {tokens.length > 0 ? (
            <div
              role="radiogroup"
              aria-label="Supported incentive token"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {tokens.map((token) => {
                const selected = token.address === selectedToken?.address;
                return (
                  <button
                    key={token.address}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={transaction.isPending}
                    onClick={() => setSelectedTokenAddress(token.address)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition",
                      selected
                        ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-white"
                        : "border-white/10 bg-white/[0.025] text-white/65 hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="block text-sm font-semibold">{token.symbol}</span>
                    <span className="block truncate text-[11px] text-white/40">
                      {shortAddress(token.address)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : !dataQuery.isLoading && gaugeAvailable ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-white/55">
              No supported incentive tokens are currently available.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="gauge-incentive-amount" className="text-sm font-medium text-white">
              Amount
            </label>
            <span className="text-xs text-white/50">
              Balance:{" "}
              {selectedToken
                ? formatCompactRawTokenAmount(
                    selectedToken.balance,
                    selectedToken.decimals,
                    selectedToken.symbol,
                  )
                : "Unavailable"}
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              id="gauge-incentive-amount"
              aria-label="Incentive amount"
              autoFocus
              inputMode="decimal"
              placeholder="0"
              value={amount}
              disabled={transaction.isPending || (!dataQuery.isLoading && !selectedToken)}
              onChange={(event) =>
                setAmount(normalizeAmountInput(event.target.value, selectedToken?.decimals ?? 18))
              }
              className="h-12 text-lg"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={
                !selectedToken?.balance || selectedToken.balance <= 0n || transaction.isPending
              }
              onClick={() => {
                if (selectedToken?.balance !== null && selectedToken?.balance !== undefined) {
                  setAmount(formatUnits(selectedToken.balance, selectedToken.decimals));
                }
              }}
            >
              Max
            </Button>
          </div>
          {amount && validation.error ? (
            <p role="alert" className="mt-2 text-xs text-red-200">
              {validation.error}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">Existing incentives this epoch</p>
            <Badge className="border-white/10 bg-white/[0.04] text-white/65">
              Voting incentives
            </Badge>
          </div>
          {tokens.some((token) => (token.currentEpochIncentives ?? 0n) > 0n) ? (
            <div className="space-y-2">
              {tokens
                .filter((token) => (token.currentEpochIncentives ?? 0n) > 0n)
                .map((token) => (
                  <div
                    key={token.address}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-white/60">{token.symbol}</span>
                    <span className="font-medium text-white">
                      {formatCompactRawTokenAmount(
                        token.currentEpochIncentives,
                        token.decimals,
                        token.symbol,
                      )}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">No incentives have been posted for this epoch.</p>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm">
          <p className="font-medium text-white">Transaction summary</p>
          <div className="flex items-center justify-between gap-3 text-white/55">
            <span>Token and amount</span>
            <span className="text-right text-white">
              {amount || "0"} {selectedToken?.symbol ?? "token"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-white/55">
            <span>Recipient</span>
            <code
              className="text-right text-xs text-white"
              title={props.target.incentiveRecipientAddress}
            >
              {shortAddress(props.target.incentiveRecipientAddress)}
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 text-white/55">
            <span>Period</span>
            <span className="text-right text-white">Current seven-day voting epoch</span>
          </div>
        </div>

        {transaction.state === "approval-success" ? (
          <FeatureStatusPanel
            tone="success"
            title="Approval confirmed"
            message="Allowance is refreshing. You can submit the incentive as soon as the final action enables."
          />
        ) : transaction.state === "incentive-success" ? (
          <FeatureStatusPanel
            tone="success"
            title="Gauge incentivised"
            message="The current epoch incentives, balance, and allowance have been refreshed."
          />
        ) : transaction.error ? (
          <FeatureStatusPanel tone="error" title="Transaction failed" message={transaction.error} />
        ) : null}

        <div className="w-full [&>div]:w-full">
          <WalletConnectButton>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={!validation.canApprove || !actionParams || transaction.isPending}
                onClick={() => {
                  if (actionParams) void transaction.approve(actionParams);
                }}
              >
                {transaction.state === "approving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {transaction.state === "approving"
                  ? "Approving…"
                  : `Approve ${selectedToken?.symbol ?? "token"}`}
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={!validation.canIncentivise || !actionParams || transaction.isPending}
                onClick={() => {
                  if (actionParams) void transaction.incentivise(actionParams);
                }}
              >
                {transaction.state === "incentivising" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : transaction.state === "incentive-success" ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Gift className="h-4 w-4" aria-hidden="true" />
                )}
                {transaction.state === "incentivising" ? "Incentivising…" : "Incentivise gauge"}
              </Button>
            </div>
          </WalletConnectButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IncentiviseGaugeButton({ pair }: { pair: AuroveLiquidityPair }) {
  const chainId = useChainId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resolution = resolveGaugeIncentiveTarget(chainId, pair.key);

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 md:items-end">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        disabled={!resolution.available}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={resolution.reason ?? `Incentivise the ${pair.pairLabel} voting gauge`}
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        <Gift className="h-4 w-4" aria-hidden="true" />
        Incentivise gauge
      </Button>
      {!resolution.available ? (
        <p className="max-w-xs text-xs leading-5 text-amber-100/70">{resolution.reason}</p>
      ) : null}
      {resolution.available ? (
        <GaugeIncentiveModal
          open={open}
          onOpenChange={setOpen}
          target={resolution.target}
          returnFocusRef={triggerRef}
        />
      ) : null}
    </div>
  );
}
