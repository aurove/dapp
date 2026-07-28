import { formatUnits } from "viem";

import type { EarnProduct } from "../use-earn-data";

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export type TrancheApyEstimate = {
  product: EarnProduct;
  apyPercent: number;
};

/** Stable key for APY basis lookups. Prefer the reward sink (where RewardsFunded is emitted). */
export function earnApyProductKey(
  product: Pick<EarnProduct, "ledgerAddress" | "trancheId" | "rewardSinkAddress">,
): string {
  if (product.rewardSinkAddress) {
    return product.rewardSinkAddress.toLowerCase();
  }

  return `${product.ledgerAddress.toLowerCase()}:${product.trancheId.toString()}`;
}

export function formatApyPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not estimated";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return (
    new Intl.NumberFormat(undefined, {
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(value) + "%"
  );
}

/**
 * Estimates annualized yield from the latest reward funding snapshot.
 * Managed products are annualized on a weekly Mezo-epoch cadence.
 */
export function estimateTrancheApy(product: EarnProduct): TrancheApyEstimate | null {
  const totalSupplyRaw = product.apyTotalSupplyAtFundingRaw ?? 0n;
  const rewardAmountRaw = product.apyRewardAmountRaw ?? 0n;
  if (totalSupplyRaw <= 0n || rewardAmountRaw <= 0n) return null;

  const rewardDeposited = Number(formatUnits(rewardAmountRaw, product.rewardDecimals));
  const totalSupply = Number(formatUnits(totalSupplyRaw, product.decimals || 18));
  if (!Number.isFinite(rewardDeposited) || !Number.isFinite(totalSupply) || totalSupply <= 0) {
    return null;
  }

  const annualization = SECONDS_PER_YEAR / WEEK_SECONDS;

  return {
    product,
    apyPercent: (rewardDeposited / totalSupply) * annualization * 100,
  };
}

export function summarizeEstimatedYield(estimates: readonly TrancheApyEstimate[]): {
  value: string;
  detail: string;
  subtle: boolean;
} {
  if (estimates.length === 0) {
    return {
      value: "Not available yet",
      detail: "Yield data will appear after reward funding is observed for a live Aurove asset.",
      subtle: true,
    };
  }

  const percents = estimates.map((item) => item.apyPercent);
  const min = Math.min(...percents);
  const max = Math.max(...percents);
  const value =
    estimates.length === 1 || Math.abs(max - min) < 0.005
      ? formatApyPercent(max)
      : `${formatApyPercent(min)} – ${formatApyPercent(max)}`;

  const detail = estimates
    .map((item) => `${item.product.symbol} ${formatApyPercent(item.apyPercent)}`)
    .join(" · ");

  return { value, detail, subtle: false };
}
