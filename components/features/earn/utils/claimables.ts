import type { EarnProduct } from "../use-earn-data";

export type ClaimableSummary = {
  key: string;
  amountRaw: bigint;
  symbol: string;
  decimals: number;
  trancheCount: number;
  products: EarnProduct[];
};

export function summarizeClaimables(products: readonly EarnProduct[]): ClaimableSummary[] {
  const summaries = new Map<string, ClaimableSummary>();

  for (const product of products) {
    if (product.claimableRewardsRaw <= 0n) continue;

    const symbol = product.rewardSymbol ?? "Reward";
    const key = product.rewardAsset?.toLowerCase() ?? `${symbol}-${product.rewardDecimals}`;
    const existing = summaries.get(key);

    if (existing) {
      existing.amountRaw += product.claimableRewardsRaw;
      existing.trancheCount += 1;
      existing.products.push(product);
      continue;
    }

    summaries.set(key, {
      key,
      amountRaw: product.claimableRewardsRaw,
      symbol,
      decimals: product.rewardDecimals,
      trancheCount: 1,
      products: [product],
    });
  }

  return [...summaries.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function claimablesPanelState(
  summaries: readonly ClaimableSummary[],
): "empty" | "claimable" {
  return summaries.length === 0 ? "empty" : "claimable";
}
