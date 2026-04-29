import { formatUnits, parseUnits } from "viem";

export type EarnAssetId = "veBTC" | "veMEZO";
export type EarnLifecycle = "active" | "settlement" | "rolled";

export const EARN_ASSET_LABELS: Record<EarnAssetId, string> = {
  veBTC: "veBTC",
  veMEZO: "veMEZO",
};

export const DEFAULT_TRANCHE_OPTIONS = [4, 12, 26, 52] as const;
export const SECONDS_PER_YEAR = 31_536_000n;

export function decodeTrancheId(
  trancheId: bigint,
): { assetId: EarnAssetId; trancheNumber: number } | null {
  const trancheNumber = Number(trancheId & 0xffffn);
  const variantPart = Number((trancheId >> 16n) & 0xffn);
  const normalized = (BigInt(variantPart) << 16n) | BigInt(trancheNumber);

  if (
    (variantPart !== 1 && variantPart !== 2) ||
    trancheNumber < 1 ||
    trancheNumber > 208 ||
    normalized !== trancheId
  ) {
    return null;
  }

  return {
    assetId: variantPart === 1 ? "veBTC" : "veMEZO",
    trancheNumber,
  };
}

export function deriveTrancheId(assetId: EarnAssetId, trancheNumber: number): bigint {
  const variantPart = assetId === "veBTC" ? 1 : 2;
  return BigInt((variantPart << 16) | trancheNumber);
}

export function lifecycleFromValue(value: number): EarnLifecycle {
  if (value === 1) return "settlement";
  if (value === 2) return "rolled";
  return "active";
}

export function lifecycleLabel(lifecycle: EarnLifecycle): string {
  if (lifecycle === "settlement") return "Settlement";
  if (lifecycle === "rolled") return "Rollover due";
  return "Active";
}

export function formatDateTime(timestamp: bigint | null): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(Number(timestamp) * 1000));
}

export function formatDurationFromNow(timestamp: bigint | null, nowTimestamp: number): string {
  if (!timestamp) return "-";

  const delta = Number(timestamp) - nowTimestamp;
  const absolute = Math.abs(delta);
  const days = Math.floor(absolute / 86_400);
  const hours = Math.floor((absolute % 86_400) / 3_600);
  const minutes = Math.floor((absolute % 3_600) / 60);
  const value =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return delta >= 0 ? value : `${value} ago`;
}

export function parsePositiveTokenAmount(value: string, decimals: number): bigint | null {
  try {
    const parsed = parseUnits(value.trim(), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function formatTokenInput(value: bigint, decimals: number): string {
  return formatUnits(value, decimals);
}

export function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

export function calculateVirtualAprPct(
  rewardRateRaw: bigint,
  totalSupplyRaw: bigint,
): number | null {
  if (rewardRateRaw <= 0n || totalSupplyRaw <= 0n) return null;
  const basisPoints = (rewardRateRaw * SECONDS_PER_YEAR * 10_000n) / totalSupplyRaw;
  return Number(basisPoints) / 100;
}
