"use client";

import type { ReactNode } from "react";
import type { Abi, Address } from "viem";

import { cn } from "@ui";
import type { PortfolioSummary, WalletPortfolio } from "@/features/portfolio";
import type { Position, TokenMeta } from "../position-display";

export type ClGauge = {
  key: string;
  poolKey: string;
  pool: Address;
  address: Address;
  abi: readonly unknown[];
  rewardToken?: Address;
};

export type PositionManageSharedProps = {
  position: Position;
  token0?: TokenMeta;
  token1?: TokenMeta;
  displayInverted: boolean;
  managerAddress: Address;
  managerAbi: Abi;
  routerAddress: Address;
  routerAbi: Abi;
  ledgerAddress: Address;
  deadline: bigint | null;
  portfolio?: PortfolioSummary;
  veCollections: WalletPortfolio["veCollections"];
  gauge: ClGauge | null;
  rewardTokenMeta?: TokenMeta;
  restakeAfter: boolean;
  onRestakeAfterChange: (value: boolean) => void;
  onComplete: (message: string) => () => void;
  onError: (message: string) => void;
};

export function ActionMessage({ success, error }: { success: string | null; error: string | null }) {
  if (!success && !error) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        error
          ? "border-red-300/20 bg-red-300/10 text-red-100"
          : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
      )}
    >
      {error ?? success}
    </p>
  );
}

export function FarmHandoffNotice({
  isStaked,
  restakeAfter,
  onRestakeAfterChange,
  restakeEnabled = true,
  children,
}: {
  isStaked: boolean;
  restakeAfter: boolean;
  onRestakeAfterChange: (value: boolean) => void;
  restakeEnabled?: boolean;
  children?: ReactNode;
}) {
  if (!isStaked) return children ? <>{children}</> : null;
  return (
    <div className="space-y-3 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4">
      <div>
        <h4 className="font-medium text-sky-50">Farming will pause for this change</h4>
        <p className="mt-1 text-sm text-sky-100/80">
          The gauge holds this NFT, so the transaction unstakes first. Gauge rewards are claimed automatically on unstake.
        </p>
      </div>
      {restakeEnabled ? (
        <label className="flex items-center gap-2 text-xs text-sky-100/85">
          <input
            type="checkbox"
            checked={restakeAfter}
            onChange={(event) => onRestakeAfterChange(event.target.checked)}
          />
          Restake the position after the change
        </label>
      ) : (
        <p className="text-xs text-sky-100/75">This change leaves no liquidity to restake.</p>
      )}
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      className="grid gap-1 rounded-2xl border border-white/10 bg-white/[0.025] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-medium transition",
            value === option.id ? "bg-white/10 text-white shadow-sm" : "text-white/55 hover:text-white/80",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
