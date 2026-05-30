import { formatUnits, parseUnits, type Address } from "viem";

const DEFAULT_DECIMALS = 18;

export function readResult<T>(
  reads: Array<{ result?: unknown }> | undefined,
  index: number,
): T | undefined {
  return reads?.[index]?.result as T | undefined;
}

export function readBigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

export function readAddress(value: unknown): Address | null {
  return typeof value === "string" && value.startsWith("0x") ? (value as Address) : null;
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function sameAddress(a: Address | null | undefined, b: Address | null | undefined) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function parseAmountRaw(value: string, decimals = DEFAULT_DECIMALS): bigint | null {
  const normalized = value.trim();
  if (!normalized) return null;

  try {
    const parsed = parseUnits(normalized, decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function formatCompactNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits,
  }).format(value);
}

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
    return formatCompactNumber(value, 2);
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

export function formatRawNumber(raw: string) {
  if (isNaN(Number(raw))) throw new Error(`${raw} is NaN`);

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

  return formatted;
}

export function formatRawTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
  symbol?: string,
): string {
  if (value === null || value === undefined) return "-";

  // Keep the source string canonical so `formatRawNumber` only sees plain decimals.
  // Compact notation like `142.11K` cannot be parsed back into a number safely.
  const raw = formatUnits(value, decimals);
  const formatted = formatRawNumber(raw);

  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function formatCompactRawTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
  symbol?: string | null,
): string {
  if (value === null || value === undefined) return "Unavailable";

  const raw = formatUnits(value, decimals);
  const numeric = Number(raw);

  if (!Number.isFinite(numeric)) {
    return symbol ? `${raw} ${symbol}` : raw;
  }

  const formatted =
    Math.abs(numeric) > 0.1 ? formatCompactNumber(numeric, 4) : formatRawNumber(raw);

  return symbol ? `${formatted} ${symbol}` : formatted;
}
