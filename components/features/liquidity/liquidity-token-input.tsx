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
import type { SlipstreamLiquiditySource } from "./slipstream-liquidity-quote";

function tokenImageForSymbol(symbol: string | null) {
  const normalized = symbol?.toUpperCase() ?? "";
  if (normalized.includes("MUSD")) return "/tokens/MUSD.png";
  if (normalized.includes("MEZO")) return "/tokens/MEZO.png";
  if (normalized.includes("BTC")) return "/tokens/BTC.png";
  return "/tokens/Aurove.png";
}

function sourceKindLabel(source: SlipstreamLiquiditySource) {
  if (source.kind === "erc20") return source.representation === "wrapped" ? "WRAPPED" : "ERC20";
  if (source.kind === "venft") return "LOCKED";
  return "LIQUID";
}

function sourceBalanceLabel(source: SlipstreamLiquiditySource) {
  return formatCompactRawTokenAmount(source.balanceRaw, source.decimals, null);
}

function sourceTokenIdLabel(source: SlipstreamLiquiditySource) {
  if (source.kind === "venft") return `Token ID #${source.tokenId.toString()}`;
  if (source.kind === "tranche") return `Tranche ID ${source.trancheId.toString()}`;
  return null;
}

function fundingHelper(source: SlipstreamLiquiditySource, tokenSymbol: string | null) {
  if (source.kind === "venft") {
    return `${source.label} will be deposited and converted to ${tokenSymbol ?? "the position token"}.`;
  }
  if (source.kind === "erc20" && source.mode === "wrapped") {
    return `${source.label} will be deposited and wrapped before liquidity is supplied.`;
  }
  if (source.kind === "erc20" && source.representation === "wrapped") {
    return `Wrapped ${source.label.replace(/\s*\(wrapped\)$/i, "")} will be converted for this position.`;
  }
  return null;
}

export function FundingSourceBadge({ source }: { source: SlipstreamLiquiditySource }) {
  return (
    <Badge className="shrink-0 border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] font-semibold tracking-[0.13em] text-white/68">
      {sourceKindLabel(source)}
    </Badge>
  );
}

export function FundingSourceOption({
  source,
  selected,
  onSelect,
}: {
  source: SlipstreamLiquiditySource;
  selected: boolean;
  onSelect: () => void;
}) {
  const unavailable = source.balanceRaw <= 0n;

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
            : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]",
          unavailable && "cursor-not-allowed opacity-40",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{source.label}</p>
          <div className="mt-2 flex items-center gap-2">
            {sourceTokenIdLabel(source) ? (
              <span className="text-xs text-white/48">{sourceTokenIdLabel(source)}</span>
            ) : null}
            <FundingSourceBadge source={source} />
          </div>
          <p className="mt-0.5 text-xs text-white/48">{sourceBalanceLabel(source)} available</p>
        </div>
        <Check className={cn("h-4 w-4 shrink-0 text-[var(--accent)]", !selected && "invisible")} aria-hidden="true" />
      </button>
    </SheetClose>
  );
}

export function FundingSourceSelector({
  sources,
  selectedSource,
  tokenSymbol,
  onSelectSource,
  trigger,
}: {
  sources: SlipstreamLiquiditySource[];
  selectedSource: SlipstreamLiquiditySource | null;
  tokenSymbol: string | null;
  onSelectSource: (sourceId: string) => void;
  trigger: ReactElement;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[82vh] rounded-t-[28px] px-4 pb-6 pt-5 sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2 sm:px-6">
        <SheetHeader className="pr-8">
          <SheetTitle>Choose funding source</SheetTitle>
          <SheetDescription>Available ways to fund the {tokenSymbol ?? "token"} side of this position.</SheetDescription>
        </SheetHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
          {sources.map((source) => (
            <FundingSourceOption
              key={source.id}
              source={source}
              selected={selectedSource?.id === source.id}
              onSelect={() => onSelectSource(source.id)}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function LiquidityTokenInput({
  id,
  name,
  actionLabel = "Deposit",
  tokenSymbol,
  value,
  fiatValue,
  balanceLabel,
  isEditing,
  disabled,
  loading = false,
  insufficientBalance = false,
  canMax,
  sources,
  selectedSource,
  onFocus,
  onChange,
  onMax,
  onSelectSource,
}: {
  id: string;
  name?: string;
  actionLabel?: string;
  tokenSymbol: string | null;
  value: string;
  fiatValue?: string | null;
  balanceLabel: string;
  isEditing: boolean;
  disabled: boolean;
  loading?: boolean;
  insufficientBalance?: boolean;
  canMax: boolean;
  sources: SlipstreamLiquiditySource[];
  selectedSource: SlipstreamLiquiditySource | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onMax: () => void;
  onSelectSource: (sourceId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "rounded-[24px] border bg-white/[0.03] p-4 transition sm:p-5",
          isEditing ? "border-[var(--accent)]/35" : "border-white/10",
          insufficientBalance && "border-rose-300/30",
          disabled && "opacity-65",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={id} className="text-xs font-medium text-white/52">{actionLabel}</label>
          <span className="text-[11px] font-medium text-white/38">{loading ? "Loading…" : isEditing ? "Editing" : "Quoted"}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id={id}
              name={name ?? id}
              inputMode="decimal"
              placeholder="0"
              value={value}
              onFocus={onFocus}
              onChange={(event) => onChange(event.target.value)}
              readOnly={!isEditing}
              disabled={disabled || loading}
              aria-invalid={insufficientBalance}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-3xl font-medium tabular-nums text-white shadow-none placeholder:text-white/25 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-4xl"
            />
            <p className="mt-1 h-4 truncate text-xs text-white/38">{fiatValue ?? ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <FundingSourceSelector
              sources={sources}
              selectedSource={selectedSource}
              tokenSymbol={tokenSymbol}
              onSelectSource={onSelectSource}
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-2 pr-2.5 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={`Choose funding source for ${tokenSymbol ?? "token"}${selectedSource ? `, currently ${selectedSource.label}` : ""}`}
                >
                  <span className="relative h-7 w-7 overflow-hidden rounded-full bg-white/5">
                    <Image
                      src={tokenImageForSymbol(tokenSymbol)}
                      alt={`${tokenSymbol ?? "Token"} icon`}
                      fill
                      sizes="28px"
                      className="object-contain"
                    />
                  </span>
                  <span className="text-sm font-semibold text-white">{tokenSymbol ?? "—"}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/55" aria-hidden="true" />
                </button>
              }
            />
            {selectedSource ? (
              <div className="flex max-w-48 items-center justify-end gap-1.5 text-right">
                {sourceTokenIdLabel(selectedSource) ? (
                  <span className="text-[10px] text-white/38">{sourceTokenIdLabel(selectedSource)}</span>
                ) : null}
                <FundingSourceBadge source={selectedSource} />
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-white/48">Balance: {balanceLabel}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={!canMax}
            className="font-semibold text-[var(--accent)] transition hover:text-[#e7c58f] disabled:cursor-not-allowed disabled:text-white/25"
          >
            Max
          </button>
        </div>
      </div>
      {selectedSource && fundingHelper(selectedSource, tokenSymbol) ? (
        <p className="px-1 text-xs leading-5 text-white/48">{fundingHelper(selectedSource, tokenSymbol)}</p>
      ) : null}
    </div>
  );
}
