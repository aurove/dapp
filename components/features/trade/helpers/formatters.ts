import { formatUnits } from "viem";

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 10 ? 3 : 2,
  }).format(value);
}

export function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTokenAmount(value: number, maximumFractionDigits = 6): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function formatRawTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
  symbol?: string,
): string {
  if (value === null || value === undefined) return "-";

  const formatted = formatTokenAmount(Number(formatUnits(value, decimals)));
  return symbol ? `${formatted} ${symbol}` : formatted;
}
