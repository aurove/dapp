export type EarnVariant = "veBTC" | "veMEZO";

export const EARN_VARIANTS = ["veBTC", "veMEZO"] as const satisfies readonly EarnVariant[];

export const MANAGED_TRANCHE_EPOCHS: Record<EarnVariant, number> = {
  veBTC: 4,
  veMEZO: 208,
};

const VARIANT_INDEX: Record<EarnVariant, number> = {
  veBTC: 1,
  veMEZO: 2,
};

export function getVariantAssetSymbol(variant: EarnVariant): "BTC" | "MEZO" {
  return variant === "veBTC" ? "BTC" : "MEZO";
}

export function getManagedTrancheId(variant: EarnVariant): bigint {
  return BigInt((VARIANT_INDEX[variant] << 16) | MANAGED_TRANCHE_EPOCHS[variant]);
}

export function decodeManagedTrancheId(
  trancheId: bigint,
): { variant: EarnVariant; epochs: number } | null {
  const variant = Number((trancheId >> 16n) & 0xffn);
  const epochs = Number(trancheId & 0xffffn);

  if (variant !== 1 && variant !== 2) {
    return null;
  }

  const resolvedVariant = variant === 1 ? "veBTC" : "veMEZO";
  if (epochs !== MANAGED_TRANCHE_EPOCHS[resolvedVariant]) {
    return null;
  }

  return {
    variant: resolvedVariant,
    epochs,
  };
}

export function isManagedTrancheId(trancheId: bigint): boolean {
  return decodeManagedTrancheId(trancheId) !== null;
}

export function getManagedTrancheName(variant: EarnVariant): string {
  return `Aurove ${getVariantAssetSymbol(variant)} - Managed`;
}

export function getManagedTrancheSymbol(variant: EarnVariant): string {
  return `av${getVariantAssetSymbol(variant)}m`;
}

export function getManagedTrancheLabel(variant: EarnVariant): string {
  return `${getVariantAssetSymbol(variant)} managed position`;
}
