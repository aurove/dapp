import { formatUnits } from "viem";

import type { EarnProduct } from "../use-earn-data";

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export type TrancheAprEstimate = {
  product: EarnProduct;
  annualisedAprPercent: number;
};

/** Stable key for APR basis lookups. Prefer the sink that emits RewardsFunded. */
export function earnAprProductKey(
  product: Pick<EarnProduct, "ledgerAddress" | "trancheId" | "rewardSinkAddress">,
): string {
  if (product.rewardSinkAddress) {
    return product.rewardSinkAddress.toLowerCase();
  }

  return `${product.ledgerAddress.toLowerCase()}:${product.trancheId.toString()}`;
}

export function formatAprPercent(value: number | null | undefined): string {
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
 * Annualises the latest observed weekly reward-funding rate without compounding.
 * This is a historical run-rate APR, not a forecast and does not compound returns.
 */
export function estimateTrancheApr(product: EarnProduct): TrancheAprEstimate | null {
  const totalSupplyRaw = product.aprTotalSupplyAtFundingRaw ?? 0n;
  const rewardAmountRaw = product.aprRewardAmountRaw ?? 0n;
  if (totalSupplyRaw <= 0n || rewardAmountRaw <= 0n) return null;

  const rewardFunded = Number(formatUnits(rewardAmountRaw, product.rewardDecimals));
  const totalSupply = Number(formatUnits(totalSupplyRaw, product.decimals || 18));
  if (!Number.isFinite(rewardFunded) || !Number.isFinite(totalSupply) || totalSupply <= 0) {
    return null;
  }

  return {
    product,
    annualisedAprPercent: (rewardFunded / totalSupply) * (SECONDS_PER_YEAR / WEEK_SECONDS) * 100,
  };
}

export type AssetAprSummary = {
  value: string;
  detail: string;
  available: boolean;
};

export function summarizeAssetApr(params: {
  products: readonly EarnProduct[];
  variant: EarnProduct["variant"];
  aprBasisMap: Record<
    string,
    {
      rewardAmountRaw: bigint;
      totalSupplyAtFundingRaw: bigint;
      fundingBlockNumber: bigint;
    } | null
  >;
  isLoading: boolean;
}): AssetAprSummary {
  if (params.isLoading) {
    return {
      value: "Loading…",
      detail: "Scanning reward funding history for this Aurove asset.",
      available: false,
    };
  }

  const estimates = params.products
    .filter((product) => product.variant === params.variant)
    .map((product) => {
      const basis = params.aprBasisMap[earnAprProductKey(product)];
      if (!basis) return null;
      return estimateTrancheApr({
        ...product,
        aprRewardAmountRaw: basis.rewardAmountRaw,
        aprTotalSupplyAtFundingRaw: basis.totalSupplyAtFundingRaw,
        aprFundingBlockNumber: basis.fundingBlockNumber,
      });
    })
    .filter((estimate): estimate is TrancheAprEstimate => Boolean(estimate));

  if (estimates.length === 0) {
    return {
      value: "Not available yet",
      detail: "Annualised APR will appear after reward funding is observed for this asset.",
      available: false,
    };
  }

  const summary = summarizeAnnualisedApr(estimates);
  return {
    value: summary.value,
    detail: summary.detail,
    available: !summary.subtle,
  };
}

export function summarizeAnnualisedApr(estimates: readonly TrancheAprEstimate[]): {
  value: string;
  detail: string;
  subtle: boolean;
} {
  if (estimates.length === 0) {
    return {
      value: "Not available yet",
      detail:
        "Annualised APR will appear after reward funding is observed for a live Aurove asset.",
      subtle: true,
    };
  }

  const percents = estimates.map((item) => item.annualisedAprPercent);
  const min = Math.min(...percents);
  const max = Math.max(...percents);
  const value =
    estimates.length === 1 || Math.abs(max - min) < 0.005
      ? formatAprPercent(max)
      : `${formatAprPercent(min)} – ${formatAprPercent(max)}`;

  const detail = estimates
    .map((item) => `${item.product.symbol} ${formatAprPercent(item.annualisedAprPercent)}`)
    .join(" · ");

  return { value, detail: `Latest weekly funding, annualised: ${detail}`, subtle: false };
}
