export type CanonicalAssetVariant = "veBTC" | "veMEZO";

export const TRANCHE_MIN = 1;
const WEEK_SECONDS = 7n * 24n * 60n * 60n;
export const MAX_EPOCHS_BY_VARIANT: Record<CanonicalAssetVariant, number> = {
  veBTC: 4,
  veMEZO: 208,
};

function variantPart(variant: CanonicalAssetVariant): number {
  return variant === "veBTC" ? 1 : 2;
}

export function isManagedEpochs(variant: CanonicalAssetVariant, trancheNumber: number): boolean {
  return trancheNumber === MAX_EPOCHS_BY_VARIANT[variant];
}

export function isValidEpochsForVariant(
  variant: CanonicalAssetVariant,
  trancheNumber: number,
): boolean {
  return (
    Number.isInteger(trancheNumber) &&
    trancheNumber >= TRANCHE_MIN &&
    trancheNumber <= MAX_EPOCHS_BY_VARIANT[variant]
  );
}

export function deriveTrancheId(variant: CanonicalAssetVariant, trancheNumber: number): bigint {
  if (!isValidEpochsForVariant(variant, trancheNumber)) {
    throw new Error(
      `Invalid tranche number ${trancheNumber}. Expected ${TRANCHE_MIN}-${MAX_EPOCHS_BY_VARIANT[variant]}.`,
    );
  }

  return BigInt((variantPart(variant) << 16) | trancheNumber);
}

export function deriveTrancheNumberFromLock(
  variant: CanonicalAssetVariant,
  lockEnd: bigint,
  isPermanent: boolean,
  timestamp: bigint,
): number | null {
  if (isPermanent) return null;

  const remaining = lockEnd > timestamp ? lockEnd - timestamp : 0n;
  const trancheNumber = remaining === 0n ? 0n : ((remaining - 1n) / WEEK_SECONDS) + 1n;
  const variantMax = BigInt(MAX_EPOCHS_BY_VARIANT[variant]);

  if (trancheNumber === 0n) return MAX_EPOCHS_BY_VARIANT[variant];
  if (trancheNumber < BigInt(TRANCHE_MIN)) return TRANCHE_MIN;
  if (trancheNumber > variantMax) return MAX_EPOCHS_BY_VARIANT[variant];

  return Number(trancheNumber);
}

export function deriveTrancheIdFromLock(
  variant: CanonicalAssetVariant,
  lockEnd: bigint,
  isPermanent: boolean,
  timestamp: bigint,
): bigint | null {
  const trancheNumber = deriveTrancheNumberFromLock(variant, lockEnd, isPermanent, timestamp);
  if (trancheNumber === null) return null;

  return deriveTrancheId(variant, trancheNumber);
}

export function deriveTrancheSymbol(
  variant: CanonicalAssetVariant,
  trancheNumber: number,
): string {
  return symbolOf(variant, trancheNumber);
}

export function nameOf(variant: CanonicalAssetVariant, trancheNumber: number): string {
  const asset = variant === "veBTC" ? "BTC" : "MEZO";
  if (isManagedEpochs(variant, trancheNumber)) {
    return `Liquid locked ${asset} - Managed`;
  }

  return `Liquid locked ${asset} - ${trancheNumber} Week${trancheNumber > 1 ? "s" : ""}`;
}

export function symbolOf(variant: CanonicalAssetVariant, trancheNumber: number): string {
  const asset = variant === "veBTC" ? "BTC" : "MEZO";
  if (isManagedEpochs(variant, trancheNumber)) {
    return `av${asset}m`;
  }

  return `av${asset}w${trancheNumber}`;
}

export function validateTrancheId(trancheId: bigint): void {
  if (!decodeTrancheId(trancheId)) {
    throw new Error(`Invalid tranche id ${trancheId.toString()}.`);
  }
}

export function decodeTrancheId(
  trancheId: bigint,
): { variant: CanonicalAssetVariant; trancheNumber: number } | null {
  const trancheNumber = Number(trancheId & 0xffffn);
  const part = Number((trancheId >> 16n) & 0xffn);
  const normalized = (BigInt(part) << 16n) | BigInt(trancheNumber);
  const variant = part === 1 ? "veBTC" : part === 2 ? "veMEZO" : null;

  if (!variant) return null;
  if (
    trancheNumber < TRANCHE_MIN ||
    trancheNumber > MAX_EPOCHS_BY_VARIANT[variant] ||
    normalized !== trancheId
  ) {
    return null;
  }

  return {
    variant,
    trancheNumber,
  };
}
