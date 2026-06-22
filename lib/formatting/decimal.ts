import { formatUnits } from "viem";

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

function splitDecimal(raw: string): { negative: boolean; whole: string; fraction: string } {
  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = normalized.split(".");
  return { negative, whole, fraction };
}

export function formatRawDecimal(
  raw: string,
  maximumFractionDigits?: number,
  significantDigits = 5,
): string {
  if (isNaN(Number(raw))) {
    throw new Error(`${raw} is NaN`);
  }

  const { negative, whole, fraction } = splitDecimal(raw);
  if (!fraction) {
    return negative ? `-${whole}` : whole;
  }

  const leadingZeros = fraction.match(/^0*/)?.[0].length ?? 0;
  if (leadingZeros > 3) {
    const significant = fraction.slice(leadingZeros).slice(0, significantDigits);
    return `${negative ? "-" : ""}${whole === "0" ? "0" : whole}.0${toSubscript(leadingZeros)}${significant}`;
  }

  const visibleFraction =
    typeof maximumFractionDigits === "number" ? fraction.slice(0, maximumFractionDigits) : fraction;
  const trimmedFraction = visibleFraction.replace(/0+$/, "");
  if (!trimmedFraction) {
    return negative ? `-${whole}` : whole;
  }

  return `${negative ? "-" : ""}${whole}.${trimmedFraction}`;
}

export function formatUnitsDecimal(
  value: bigint,
  decimals: number,
  maximumFractionDigits?: number,
  significantDigits = 5,
): string {
  return formatRawDecimal(formatUnits(value, decimals), maximumFractionDigits, significantDigits);
}
