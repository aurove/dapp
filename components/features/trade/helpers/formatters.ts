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

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

function toSubscript(value: number): string {
  return value
    .toString()
    .split("")
    .map((digit) => SUBSCRIPT_DIGITS[digit] ?? digit)
    .join("");
}

export function formatRawTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
  symbol?: string,
): string {
  if (value === null || value === undefined) return "-";

  const raw = formatTokenAmount(Number(formatUnits(value, decimals)));
  const [whole, fraction = ""] = raw.split(".");

  let formatted: string;

  if (!fraction) {
    formatted = whole;
  } else {
    const leadingZeros = fraction.match(/^0*/)?.[0].length ?? 0;

    // e.g. 0.000000000045566 -> 0.0₁₀45566
    if (leadingZeros > 3) {
      const significant = fraction.slice(leadingZeros).slice(0, 5);

      formatted = `0.0${toSubscript(leadingZeros)}${significant}`;
    } else {
      formatted = raw;
    }
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
}
