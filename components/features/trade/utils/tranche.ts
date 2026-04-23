export type CanonicalAssetVariant = "veBTC" | "veMEZO";

export const TRANCHE_MIN = 1;
export const TRANCHE_MAX = 208;

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

export function deriveFractionSymbol(
  variant: CanonicalAssetVariant,
  trancheNumber: number,
): string {
  // Match AssetTokenNaming.deriveTokenSymbol: fve{BTC|MEZO}-W{trancheNumber}
  deriveTrancheId(variant, trancheNumber);
  return `fve${variant === "veBTC" ? "BTC" : "MEZO"}-W${trancheNumber}`;
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
