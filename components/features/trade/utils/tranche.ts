export type CanonicalAssetVariant = "veBTC" | "veMEZO";

export const TRANCHE_MIN = 1;
export const TRANCHE_MAX = 208;
const WEEK_SECONDS = 7n * 24n * 60n * 60n;

function variantPart(variant: CanonicalAssetVariant): number {
  return variant === "veBTC" ? 1 : 2;
}

export function deriveTrancheId(variant: CanonicalAssetVariant, trancheNumber: number): bigint {
  if (
    !Number.isInteger(trancheNumber) ||
    trancheNumber < TRANCHE_MIN ||
    trancheNumber > TRANCHE_MAX
  ) {
    throw new Error(
      `Invalid tranche number ${trancheNumber}. Expected ${TRANCHE_MIN}-${TRANCHE_MAX}.`,
    );
  }

  return BigInt((variantPart(variant) << 16) | trancheNumber);
}

export function deriveTrancheNumberFromLock(
  lockEnd: bigint,
  isPermanent: boolean,
  timestamp: bigint,
): number | null {
  if (isPermanent) return null;

  const remaining = lockEnd > timestamp ? lockEnd - timestamp : 0n;
  const trancheNumber = remaining === 0n ? 0n : ((remaining - 1n) / WEEK_SECONDS) + 1n;

  if (trancheNumber < BigInt(TRANCHE_MIN)) return TRANCHE_MIN;
  if (trancheNumber > BigInt(TRANCHE_MAX)) return TRANCHE_MAX;

  return Number(trancheNumber);
}

export function deriveTrancheIdFromLock(
  variant: CanonicalAssetVariant,
  lockEnd: bigint,
  isPermanent: boolean,
  timestamp: bigint,
): bigint | null {
  const trancheNumber = deriveTrancheNumberFromLock(lockEnd, isPermanent, timestamp);
  if (trancheNumber === null) return null;

  return deriveTrancheId(variant, trancheNumber);
}

export function deriveFractionSymbol(
  variant: CanonicalAssetVariant,
  trancheNumber: number,
): string {
  // Match AssetTokenNaming.deriveTokenSymbol: av{BTC|MEZO}w{trancheNumber}
  return `av${variant === "veBTC" ? "BTC" : "MEZO"}w${trancheNumber}`;
}

export function decodeTrancheId(
  trancheId: bigint,
): { variant: CanonicalAssetVariant; trancheNumber: number } | null {
  const trancheNumber = Number(trancheId & 0xffffn);
  const part = Number((trancheId >> 16n) & 0xffn);
  const normalized = (BigInt(part) << 16n) | BigInt(trancheNumber);

  if (
    (part !== 1 && part !== 2) ||
    trancheNumber < TRANCHE_MIN ||
    trancheNumber > TRANCHE_MAX ||
    normalized !== trancheId
  ) {
    return null;
  }

  return {
    variant: part === 1 ? "veBTC" : "veMEZO",
    trancheNumber,
  };
}
