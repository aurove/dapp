"use client";

import Image from "next/image";
import type { ReactElement } from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  Badge,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@ui";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import {
  bridgeSourceHelper,
  bridgeSourceKindLabel,
  type BridgeSource,
} from "@/components/features/bridge/bridge-sources";

function tokenImageForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.includes("MEZO")) return "/tokens/MEZO.png";
  if (normalized.includes("BTC")) return "/tokens/BTC.png";
  return "/tokens/Aurove.png";
}

function sourceDetailLabel(source: BridgeSource) {
  if (source.kind === "venft") return `Token ID #${source.tokenId.toString()}`;
  if (source.kind === "tranche") return `Tranche ID ${source.trancheId.toString()}`;
  return null;
}

function SourceKindBadge({ source }: { source: BridgeSource }) {
  return (
    <Badge className="shrink-0 border-foreground/10 bg-foreground/[0.05] px-2 py-0.5 text-[9px] font-semibold tracking-[0.13em] text-foreground/68">
      {bridgeSourceKindLabel(source)}
    </Badge>
  );
}

function BridgeSourceOption({
  source,
  selected,
  onSelect,
}: {
  source: BridgeSource;
  selected: boolean;
  onSelect: () => void;
}) {
  const unavailable = source.balanceRaw <= 0n;
  const detail = sourceDetailLabel(source);

  return (
    <SheetClose asChild>
      <button
        type="button"
        disabled={unavailable}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          selected
            ? "border-[var(--accent)]/45 bg-[var(--accent)]/10"
            : "border-foreground/10 bg-foreground/[0.025] hover:border-foreground/20 hover:bg-foreground/[0.05]",
          unavailable && "cursor-not-allowed opacity-40",
        )}
      >
        <span className="relative h-9 w-9 overflow-hidden rounded-full bg-foreground/5">
          <Image
            src={tokenImageForSymbol(source.symbol)}
            alt={`${source.symbol} icon`}
            fill
            sizes="36px"
            className="object-contain"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{source.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {detail ? <span className="text-xs text-muted">{detail}</span> : null}
            <SourceKindBadge source={source} />
            {source.kind === "venft" && source.isPermanent ? (
              <Badge className="shrink-0 border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.13em] text-amber-900 dark:text-amber-100">
                PERMANENT
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formatCompactRawTokenAmount(source.balanceRaw, source.decimals, null)} available
          </p>
        </div>
        <Check className={cn("h-4 w-4 shrink-0 text-[var(--accent)]", !selected && "invisible")} aria-hidden="true" />
      </button>
    </SheetClose>
  );
}

function BridgeSourceSelector({
  sources,
  selectedSource,
  networkLabel,
  onSelectSource,
  trigger,
}: {
  sources: BridgeSource[];
  selectedSource: BridgeSource | null;
  networkLabel: string;
  onSelectSource: (sourceId: string) => void;
  trigger: ReactElement;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[82vh] rounded-t-[28px] px-4 pb-6 pt-5 sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2 sm:px-6"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>Select token variant</SheetTitle>
          <SheetDescription>
            Choose which balance to use from {networkLabel || "the source network"}.
          </SheetDescription>
        </SheetHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
          {sources.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-foreground/10 px-4 py-6 text-sm text-muted">
              No bridgeable balances found for this asset yet.
            </p>
          ) : (
            sources.map((source) => (
              <BridgeSourceOption
                key={source.id}
                source={source}
                selected={selectedSource?.id === source.id}
                onSelect={() => onSelectSource(source.id)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BridgeTokenInput({
  id,
  actionLabel = "Bridge",
  amount,
  selectedSource,
  sources,
  balanceLabel,
  networkLabel,
  loading = false,
  disabled = false,
  amountReadOnly = false,
  insufficientBalance = false,
  canMax = false,
  isEditing = false,
  onAmountChange,
  onFocus,
  onBlur,
  onMax,
  onSelectSource,
}: {
  id: string;
  actionLabel?: string;
  amount: string;
  selectedSource: BridgeSource | null;
  sources: BridgeSource[];
  balanceLabel: string;
  networkLabel: string;
  loading?: boolean;
  disabled?: boolean;
  amountReadOnly?: boolean;
  insufficientBalance?: boolean;
  canMax?: boolean;
  isEditing?: boolean;
  onAmountChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onMax: () => void;
  onSelectSource: (sourceId: string) => void;
}) {
  const displaySymbol = selectedSource?.symbol ?? "—";
  const helper = selectedSource ? bridgeSourceHelper(selectedSource) : null;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-[24px] border bg-foreground/[0.03] p-4 transition sm:p-5",
          isEditing ? "border-[var(--accent)]/35" : "border-foreground/10",
          insufficientBalance && "border-rose-300/30",
          disabled && "opacity-65",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={id} className="text-xs font-medium text-muted">
            {actionLabel}
          </label>
          <span className="text-[11px] font-medium text-muted">
            {loading ? "Loading…" : isEditing ? "Editing" : "Ready"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id={id}
              name={id}
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onFocus={onFocus}
              onBlur={onBlur}
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={disabled || loading || amountReadOnly}
              readOnly={amountReadOnly}
              aria-invalid={insufficientBalance}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-3xl font-medium tabular-nums text-foreground shadow-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-4xl"
            />
            <p className="mt-1 h-4 truncate text-xs text-muted">{networkLabel}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <BridgeSourceSelector
              sources={sources}
              selectedSource={selectedSource}
              networkLabel={networkLabel}
              onSelectSource={onSelectSource}
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.07] py-1.5 pl-2 pr-2.5 transition hover:bg-foreground/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={`Select bridge token variant, currently ${displaySymbol}`}
                >
                  <span className="relative h-7 w-7 overflow-hidden rounded-full bg-foreground/5">
                    <Image
                      src={tokenImageForSymbol(displaySymbol)}
                      alt={`${displaySymbol} icon`}
                      fill
                      sizes="28px"
                      className="object-contain"
                    />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{displaySymbol}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                </button>
              }
            />
            {selectedSource ? (
              <div className="flex max-w-48 items-center justify-end gap-1.5 text-right">
                {sourceDetailLabel(selectedSource) ? (
                  <span className="text-[10px] text-muted">{sourceDetailLabel(selectedSource)}</span>
                ) : null}
                <SourceKindBadge source={selectedSource} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-muted">Balance: {balanceLabel}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={!canMax}
            className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-soft)] disabled:cursor-not-allowed disabled:text-muted"
          >
            Max
          </button>
        </div>
      </div>
      {helper ? <p className="px-1 text-xs leading-5 text-muted">{helper}</p> : null}
    </div>
  );
}
