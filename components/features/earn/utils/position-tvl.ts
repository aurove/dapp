import type { Address } from "viem";

import {
  buildMezoTokenPriceMapMusd,
  estimateTokenAmountValueMusd,
  type MezoApiPool,
} from "@/lib/liquidity/mezo-pools";

import type { EarnProduct, EarnVariant } from "../use-earn-data";

export function wrapperSymbolForVariant(variant: EarnVariant): "avBTCm" | "avMEZOm" {
  return variant === "veBTC" ? "avBTCm" : "avMEZOm";
}

export function findWrapperPriceMusd(
  pools: readonly MezoApiPool[],
  variant: EarnVariant,
  wrapperAddress: Address | null,
): number | null {
  const prices = buildMezoTokenPriceMapMusd(pools);
  if (wrapperAddress) {
    const byAddress = prices.get(wrapperAddress.toLowerCase());
    if (byAddress != null && byAddress > 0) return byAddress;
  }
  const symbol = wrapperSymbolForVariant(variant);
  for (const pool of pools) {
    for (const token of [pool.token0, pool.token1]) {
      if (
        typeof token?.symbol === "string" &&
        token.symbol.toLowerCase() === symbol.toLowerCase()
      ) {
        const price =
          typeof token.price === "number"
            ? token.price
            : typeof token.price === "string"
              ? Number(token.price)
              : NaN;
        if (Number.isFinite(price) && price > 0) return price;
      }
    }
  }
  return null;
}

/** User earn TVL for one product: tranche shares + liquid ID20, priced as the wrapper. */
export function estimateEarnProductTvlMusd(
  product: EarnProduct,
  pools: readonly MezoApiPool[],
): number | null {
  const price = findWrapperPriceMusd(pools, product.variant, product.id20Address);
  const trancheValue = estimateTokenAmountValueMusd({
    amountRaw: product.userBalanceRaw,
    decimals: product.decimals,
    priceMusd: price,
  });
  const id20Value = estimateTokenAmountValueMusd({
    amountRaw: product.id20BalanceRaw,
    decimals: product.decimals,
    priceMusd: price,
  });
  if (trancheValue == null && id20Value == null) return null;
  return (trancheValue ?? 0) + (id20Value ?? 0);
}

export function estimateEarnPositionsTotalTvlMusd(
  products: readonly EarnProduct[],
  pools: readonly MezoApiPool[],
): number | null {
  let total = 0;
  let counted = 0;
  for (const product of products) {
    const value = estimateEarnProductTvlMusd(product, pools);
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    counted += 1;
  }
  return counted > 0 ? total : null;
}
