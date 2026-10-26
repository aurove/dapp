"use client";

import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";

import {
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
import type { HorizonBridgeAsset } from "@/lib/bridge/horizon";

export type BridgeTokenOption = {
  key: HorizonBridgeAsset;
  symbol: string;
  label: string;
};

function tokenImageForSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.includes("MEZO")) return "/tokens/MEZO.png";
  if (normalized.includes("BTC")) return "/tokens/BTC.png";
  return "/tokens/Aurove.png";
}

export function BridgeTokenInput({
  id,
  actionLabel = "Bridge",
  amount,
  selectedToken,
  tokens,
  balanceLabel,
  networkLabel,
  loading = false,
  disabled = false,
  insufficientBalance = false,
  canMax = false,
  isEditing = false,
  onAmountChange,
  onFocus,
  onBlur,
  onMax,
  onSelectToken,
}: {
  id: string;
  actionLabel?: string;
  amount: string;
  selectedToken: BridgeTokenOption;
  tokens: BridgeTokenOption[];
  balanceLabel: string;
  networkLabel: string;
  loading?: boolean;
  disabled?: boolean;
  insufficientBalance?: boolean;
  canMax?: boolean;
  isEditing?: boolean;
  onAmountChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onMax: () => void;
  onSelectToken: (key: HorizonBridgeAsset) => void;
}) {
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
              disabled={disabled || loading}
              aria-invalid={insufficientBalance}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-3xl font-medium tabular-nums text-foreground shadow-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-4xl"
            />
            <p className="mt-1 h-4 truncate text-xs text-muted">{networkLabel}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.07] py-1.5 pl-2 pr-2.5 transition hover:bg-foreground/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={`Select bridge token, currently ${selectedToken.symbol}`}
                >
                  <span className="relative h-7 w-7 overflow-hidden rounded-full bg-foreground/5">
                    <Image
                      src={tokenImageForSymbol(selectedToken.symbol)}
                      alt={`${selectedToken.symbol} icon`}
                      fill
                      sizes="28px"
                      className="object-contain"
                    />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{selectedToken.symbol}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[82vh] rounded-t-[28px] px-4 pb-6 pt-5 sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2 sm:px-6"
              >
                <SheetHeader className="pr-8">
                  <SheetTitle>Select token to bridge</SheetTitle>
                  <SheetDescription>
                    Choose which Horizon token to send from {networkLabel || "the connected chain"}.
                  </SheetDescription>
                </SheetHeader>
                <div className="max-h-[60vh] space-y-2 overflow-y-auto py-1">
                  {tokens.map((token) => {
                    const selected = selectedToken.key === token.key;
                    return (
                      <SheetClose asChild key={token.key}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSelectToken(token.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                            selected
                              ? "border-[var(--accent)]/45 bg-[var(--accent)]/10"
                              : "border-foreground/10 bg-foreground/[0.025] hover:border-foreground/20 hover:bg-foreground/[0.05]",
                          )}
                        >
                          <span className="relative h-9 w-9 overflow-hidden rounded-full bg-foreground/5">
                            <Image
                              src={tokenImageForSymbol(token.symbol)}
                              alt={`${token.symbol} icon`}
                              fill
                              sizes="36px"
                              className="object-contain"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{token.symbol}</span>
                            <span className="mt-1 block text-xs text-muted">{token.label}</span>
                          </span>
                          <Check
                            className={cn("h-4 w-4 shrink-0 text-[var(--accent)]", !selected && "invisible")}
                            aria-hidden="true"
                          />
                        </button>
                      </SheetClose>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
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
    </div>
  );
}
