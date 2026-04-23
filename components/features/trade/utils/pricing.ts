const FRACTION_DECIMALS = 18n;
const FRACTION_SCALE = 10n ** FRACTION_DECIMALS;

/**
 * Computes the exact on-chain quote token amount for 18-decimal fixed-point
 * fraction amounts.
 */
export function quoteRequiredPaymentRaw(
  amountRaw: bigint | null,
  pricePerFractionRaw: bigint | null,
): bigint {
  if (!amountRaw || !pricePerFractionRaw || amountRaw <= 0n || pricePerFractionRaw <= 0n) {
    return 0n;
  }

  return (amountRaw * pricePerFractionRaw) / FRACTION_SCALE;
}
