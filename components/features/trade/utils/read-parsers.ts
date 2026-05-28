import { formatUnits, type Address } from "viem";

const DEFAULT_DECIMALS = 18;

export function toAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  return value as Address;
}

export function toDecimals(value: unknown, fallback = DEFAULT_DECIMALS): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

export function toTokenSymbol(value: unknown, fallbackAddress: Address): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return `${fallbackAddress.slice(0, 6)}...${fallbackAddress.slice(-4)}`;
}

export function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function parseReadError(value: unknown, fallbackMessage: string): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }
  return new Error(fallbackMessage);
}

function formatCompactAmount(amount: bigint, decimals = 18): string {
  const full = formatUnits(amount, decimals);
  const [whole, fraction = ""] = full.split(".");
  const cleanFraction = fraction.replace(/0+$/, "").slice(0, 6);
  return cleanFraction.length > 0 ? `${whole}.${cleanFraction}` : whole;
}

export function formatLockEndLabel(lockEnd: bigint, isPermanent: boolean): string {
  if (isPermanent) return "Permanent lock";
  if (lockEnd <= 0n) return "No lock end";

  const millis = Number(lockEnd) * 1000;
  if (!Number.isFinite(millis) || millis <= 0) {
    return "Unknown lock end";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(millis));
}

export function formatCompactTokenAmount(amount: bigint, decimals = 18): string {
  const parsed = Number.parseFloat(formatCompactAmount(amount, decimals));
  if (!Number.isFinite(parsed)) {
    return formatUnits(amount, decimals);
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(parsed);
}
