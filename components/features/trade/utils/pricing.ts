const FRACTION_DECIMALS = 18n;
const FRACTION_SCALE = 10n ** FRACTION_DECIMALS;

type PriceBearingOrder = {
  pricePerUnit?: bigint;
  priceRaw?: bigint;
};

function getOrderPriceRaw(order: PriceBearingOrder): bigint {
  return order.priceRaw ?? order.pricePerUnit ?? 0n;
}

function compareBigintAscending(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortAsksByBestPrice<T extends PriceBearingOrder>(asks: readonly T[]): T[] {
  return [...asks].sort((a, b) => compareBigintAscending(getOrderPriceRaw(a), getOrderPriceRaw(b)));
}

export function sortBidsByBestPrice<T extends PriceBearingOrder>(bids: readonly T[]): T[] {
  return [...bids].sort((a, b) => compareBigintAscending(getOrderPriceRaw(b), getOrderPriceRaw(a)));
}

export function getBestAsk<T extends PriceBearingOrder>(asks: readonly T[]): T | null {
  return sortAsksByBestPrice(asks)[0] ?? null;
}

export function getBestBid<T extends PriceBearingOrder>(bids: readonly T[]): T | null {
  return sortBidsByBestPrice(bids)[0] ?? null;
}

export function getSpread(
  bestAsk: PriceBearingOrder | null | undefined,
  bestBid: PriceBearingOrder | null | undefined,
): bigint | null {
  if (!bestAsk || !bestBid) return null;
  return getOrderPriceRaw(bestAsk) - getOrderPriceRaw(bestBid);
}

export function getMidPrice(
  bestAsk: PriceBearingOrder | null | undefined,
  bestBid: PriceBearingOrder | null | undefined,
): bigint | null {
  if (!bestAsk || !bestBid) return null;
  return (getOrderPriceRaw(bestAsk) + getOrderPriceRaw(bestBid)) / 2n;
}

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
