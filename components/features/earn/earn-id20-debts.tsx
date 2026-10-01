"use client";

import { Scale } from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { Card, CardContent, Skeleton, cn } from "@ui";
import {
  useId20GaugePositions,
  type Id20GaugePosition,
} from "@/components/features/id20/use-id20-gauges";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";

function amountLabel(amount: bigint, position: Id20GaugePosition): string {
  return formatCompactRawTokenAmount(amount, position.decimals, null);
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm",
          emphasis ? "font-semibold text-emerald-100" : "text-white/80",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DebtRow({ position }: { position: Id20GaugePosition }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{position.symbol} ID20</p>
          <p className="mt-1 text-xs text-white/45">
            {position.isActivated ? "Activated reward account" : "Not activated"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/45">Wallet balance</p>
          <p className="mt-1 text-sm font-medium text-white">
            {amountLabel(position.balanceRaw, position)} {position.symbol}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          label="Debt weight"
          value={`${amountLabel(position.debtWeightRaw, position)} ${position.symbol}`}
        />
        <Metric
          label="Unsettled credit"
          value={`${amountLabel(position.unsettledCreditRaw, position)} ${position.symbol}`}
        />
        <Metric
          label="Lent weight"
          value={`${amountLabel(position.lentWeightRaw, position)} ${position.symbol}`}
        />
        <Metric
          label="Claimable"
          value={`${amountLabel(position.claimableRewardRaw, position)} ${position.symbol}`}
          emphasis={position.claimableRewardRaw > 0n}
        />
      </div>
    </div>
  );
}

export function EarnId20Debts() {
  const { address } = useAccount();
  const chainId = useChainId();
  const gauges = useId20GaugePositions(chainId, address);
  const positions = gauges.positions.filter(
    (position) =>
      position.debtWeightRaw > 0n ||
      position.unsettledCreditRaw > 0n ||
      position.lentWeightRaw > 0n ||
      position.claimableRewardRaw > 0n,
  );

  if (!address) return null;
  if (!gauges.isLoading && !gauges.error && positions.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="earn-id20-debts-title">
      <div>
        <h2 id="earn-id20-debts-title" className="text-2xl font-semibold text-white">
          Your ID20 debt &amp; rewards
        </h2>
        <p className="mt-1 text-sm text-white/55">
          Debt-backed reward weight, unsettled credit, and every claimable reward tied to your ID20
          accounts.
        </p>
      </div>

      {gauges.isLoading ? (
        <Card className="border-white/10 bg-white/[0.025]">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : gauges.error ? (
        <Card className="border-amber-300/20 bg-amber-300/[0.06]">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-100">
            <Scale className="mt-0.5 h-4 w-4 shrink-0" />
            <span>ID20 debt and claimable rewards are temporarily unavailable.</span>
          </CardContent>
        </Card>
      ) : positions.length > 0 ? (
        <Card className="border-white/10 bg-gradient-to-r from-violet-300/[0.045] via-white/[0.025] to-transparent">
          <CardContent className="space-y-3 p-4">
            {positions.map((position) => (
              <DebtRow key={position.key} position={position} />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
