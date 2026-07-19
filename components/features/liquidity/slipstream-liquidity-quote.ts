"use client";

import type { Address } from "viem";
import {
  getAmount0ForLiquidity,
  getAmount1ForLiquidity,
  getLiquidityForAmount0,
  getLiquidityForAmount1,
  getLiquidityForAmount0WithinRange,
  getLiquidityForAmount1WithinRange,
  getPoolTickBounds,
  tickToSqrtPriceX96BigInt,
  type SlipstreamPoolState,
  type SlipstreamTickRange,
} from "./slipstream-adapter";

export type SlipstreamLiquiditySide = "assetA" | "assetB";
export type SlipstreamSourceFamily = "BTC" | "MEZO" | "MUSD" | "UNKNOWN";
export type SlipstreamSourceKind = "erc20" | "venft" | "tranche";
export type SlipstreamLiquidityStatus =
  | "ok"
  | "insufficient-balance"
  | "unsupported-input-combination"
  | "invalid-range"
  | "unavailable-quote";

export type SlipstreamRouterErc20DepositInput = {
  token: Address;
  deposit: {
    variant: number;
    epochs: bigint;
    value: bigint;
  };
};

export type SlipstreamRouterVeNftDepositInput = {
  deposit: {
    variant: number;
    epochs: bigint;
    value: bigint;
  };
};

export type SlipstreamRouterTrancheWrapInput = {
  trancheId: bigint;
  amount: bigint;
};

export type SlipstreamRouterSideInput =
  | { kind: "erc20"; input: SlipstreamRouterErc20DepositInput }
  | { kind: "venft"; input: SlipstreamRouterVeNftDepositInput }
  | { kind: "tranche"; input: SlipstreamRouterTrancheWrapInput };

export type SlipstreamLiquidityPlan = {
  overload: string;
  inputA: SlipstreamRouterSideInput;
  inputB: SlipstreamRouterSideInput;
  params: {
    amountAMinimum: bigint;
    amountBMinimum: bigint;
    tickLower: number;
    tickUpper: number;
    receiver: Address;
    deadline: bigint;
  };
};

export type SlipstreamLiquiditySource =
  | {
      id: string;
      kind: "erc20";
      mode: "plain" | "wrapped";
      family: SlipstreamSourceFamily;
      label: string;
      token: Address;
      balanceRaw: bigint;
      allowanceRaw: bigint;
      decimals: number;
      variant: number;
      epochs: bigint;
    }
  | {
      id: string;
      kind: "venft";
      family: Exclude<SlipstreamSourceFamily, "MUSD" | "UNKNOWN">;
      label: string;
      contractAddress: Address;
      tokenId: bigint;
      balanceRaw: bigint;
      availableFractionCapacityRaw: bigint;
      decimals: number;
      variant: number;
      epochs: bigint;
    }
  | {
      id: string;
      kind: "tranche";
      family: Exclude<SlipstreamSourceFamily, "MUSD" | "UNKNOWN">;
      label: string;
      contractAddress: Address;
      trancheId: bigint;
      balanceRaw: bigint;
      decimals: number;
      variant: number;
      epochs: bigint;
    };

export type SlipstreamLiquidityQuote = {
  status: SlipstreamLiquidityStatus;
  errorMessage: string | null;
  activeSide: SlipstreamLiquiditySide;
  beginsInRange: boolean;
  activeAmountRaw: bigint;
  amountAUsedRaw: bigint | null;
  amountBUsedRaw: bigint | null;
  amountAUnusedRaw: bigint | null;
  amountBUnusedRaw: bigint | null;
  liquidityRaw: bigint | null;
  amountAMinimumRaw: bigint | null;
  amountBMinimumRaw: bigint | null;
  routerPlan: SlipstreamLiquidityPlan | null;
};

const SLIPPAGE_BPS_DEFAULT = 50n;

function familyFromSymbol(symbol?: string | null): SlipstreamSourceFamily {
  const normalized = symbol?.trim().toUpperCase() ?? "";
  if (normalized.includes("MUSD")) return "MUSD";
  if (normalized.includes("BTC")) return "BTC";
  if (normalized.includes("MEZO")) return "MEZO";
  return "UNKNOWN";
}

export function sourceFamilyForToken(symbol?: string | null): SlipstreamSourceFamily {
  return familyFromSymbol(symbol);
}

export function canUseSourceKindForFamily(family: SlipstreamSourceFamily, kind: SlipstreamSourceKind) {
  if (family === "MUSD" || family === "UNKNOWN") {
    return kind === "erc20";
  }

  return true;
}

export function sourceDefaultVariantAndEpochs(family: SlipstreamSourceFamily) {
  switch (family) {
    case "BTC":
      return { variant: 1, epochs: 4n };
    case "MEZO":
      return { variant: 2, epochs: 208n };
    case "MUSD":
      return { variant: 0, epochs: 0n };
    default:
      return { variant: 0, epochs: 0n };
  }
}

export function isSlipstreamRangeValid(range: SlipstreamTickRange | null, tickSpacing: number | null) {
  if (!range || !tickSpacing) return false;
  const bounds = getPoolTickBounds(tickSpacing);
  return (
    Number.isInteger(range.tickLower) &&
    Number.isInteger(range.tickUpper) &&
    range.tickLower >= bounds.minUsable &&
    range.tickUpper <= bounds.maxUsable &&
    range.tickUpper > range.tickLower
  );
}

function routerInputForSource(source: SlipstreamLiquiditySource, amountRaw: bigint): SlipstreamRouterSideInput {
  if (source.kind === "erc20") {
    return {
      kind: "erc20",
      input: {
        token: source.token,
        deposit: {
          variant: source.variant,
          epochs: source.epochs,
          value: amountRaw,
        },
      },
    };
  }

  if (source.kind === "venft") {
    return {
      kind: "venft",
      input: {
        deposit: {
          variant: source.variant,
          epochs: source.epochs,
          value: source.tokenId,
        },
      },
    };
  }

  return {
    kind: "tranche",
    input: {
      trancheId: source.trancheId,
      amount: amountRaw,
    },
  };
}

function balanceForSource(source: SlipstreamLiquiditySource | null) {
  return source?.balanceRaw ?? 0n;
}

function quoteAmountsForActiveSide(params: {
  pool: SlipstreamPoolState;
  range: SlipstreamTickRange;
  activeSide: SlipstreamLiquiditySide;
  activeAmountRaw: bigint;
}) {
  const { pool, range, activeSide, activeAmountRaw } = params;
  const currentTick = pool.currentTick;
  const sqrtCurrentX96 = pool.sqrtPriceX96 ?? (currentTick !== null ? tickToSqrtPriceX96BigInt(currentTick) : null);
  const sqrtLowerX96 = tickToSqrtPriceX96BigInt(range.tickLower);
  const sqrtUpperX96 = tickToSqrtPriceX96BigInt(range.tickUpper);

  if (currentTick === null || sqrtCurrentX96 === null || activeAmountRaw <= 0n) {
    return null;
  }

  if (activeSide === "assetA") {
    if (currentTick < range.tickLower) {
      const liquidity = getLiquidityForAmount0({ amount0: activeAmountRaw, sqrtLowerX96, sqrtUpperX96 });
      const amountAUsedRaw = activeAmountRaw;
      const amountBUsedRaw = 0n;

      return {
        amountAUsedRaw,
        amountBUsedRaw,
        liquidityRaw: liquidity,
      };
    }

    if (currentTick >= range.tickUpper) {
      return {
        amountAUsedRaw: 0n,
        amountBUsedRaw: 0n,
        liquidityRaw: 0n,
      };
    }

    const liquidity = getLiquidityForAmount0WithinRange({
      amount0: activeAmountRaw,
      sqrtCurrentX96,
      sqrtUpperX96,
    });
    const amountBUsedRaw = getAmount1ForLiquidity({
      liquidity,
      sqrtLowerX96,
      sqrtCurrentX96,
    });

    return {
      amountAUsedRaw: activeAmountRaw,
      amountBUsedRaw,
      liquidityRaw: liquidity,
    };
  }

  if (currentTick >= range.tickUpper) {
    const liquidity = getLiquidityForAmount1({
      amount1: activeAmountRaw,
      sqrtLowerX96,
      sqrtUpperX96,
    });
    return {
      amountAUsedRaw: 0n,
      amountBUsedRaw: activeAmountRaw,
      liquidityRaw: liquidity,
    };
  }

  const liquidity = getLiquidityForAmount1WithinRange({
    amount1: activeAmountRaw,
    sqrtLowerX96,
    sqrtCurrentX96,
  });
  const amountAUsedRaw = getAmount0ForLiquidity({
    liquidity,
    sqrtUpperX96,
    sqrtCurrentX96,
  });

  return {
    amountAUsedRaw,
    amountBUsedRaw: activeAmountRaw,
    liquidityRaw: liquidity,
  };
}

function slippageAdjusted(amount: bigint, slippageBps: bigint) {
  if (amount <= 0n) return 0n;
  const clipped = slippageBps < 0n ? 0n : slippageBps > 10_000n ? 10_000n : slippageBps;
  return (amount * (10_000n - clipped)) / 10_000n;
}

export function buildSlipstreamLiquidityQuote(params: {
  pool: SlipstreamPoolState;
  range: SlipstreamTickRange | null;
  activeSide: SlipstreamLiquiditySide;
  activeAmountRaw: bigint;
  sourceA: SlipstreamLiquiditySource | null;
  sourceB: SlipstreamLiquiditySource | null;
  receiver: Address | null;
  deadline: bigint | null;
  slippageBps?: bigint;
}) {
  const { pool, range, activeSide, activeAmountRaw, sourceA, sourceB, receiver, deadline } = params;
  const slippageBps = params.slippageBps ?? SLIPPAGE_BPS_DEFAULT;

  if (!pool.tickSpacing || pool.currentTick === null || pool.sqrtPriceX96 === null || !range) {
    return {
      status: "unavailable-quote" as const,
      errorMessage: "Liquidity data is still loading.",
      activeSide,
      beginsInRange: false,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  const currentTick = pool.currentTick;
  const beginsInRange = currentTick >= range.tickLower && currentTick < range.tickUpper;
  const belowRange = currentTick < range.tickLower;
  const aboveRange = currentTick >= range.tickUpper;

  if ((belowRange && activeSide === "assetB") || (aboveRange && activeSide === "assetA")) {
    return {
      status: "unavailable-quote" as const,
      errorMessage:
        activeSide === "assetA"
          ? "This range sits above the market, so assetA alone cannot seed liquidity."
          : "This range sits below the market, so assetB alone cannot seed liquidity.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: 0n,
      amountBUsedRaw: 0n,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: 0n,
      amountAMinimumRaw: 0n,
      amountBMinimumRaw: 0n,
      routerPlan: null,
    };
  }

  if (!isSlipstreamRangeValid(range, pool.tickSpacing)) {
    return {
      status: "invalid-range" as const,
      errorMessage: "Choose a valid tick range.",
      activeSide,
      beginsInRange: false,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  if (activeAmountRaw <= 0n) {
    return {
      status: "unavailable-quote" as const,
      errorMessage: "Enter an amount to preview liquidity.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: 0n,
      amountBUsedRaw: 0n,
      amountAUnusedRaw: 0n,
      amountBUnusedRaw: 0n,
      liquidityRaw: 0n,
      amountAMinimumRaw: 0n,
      amountBMinimumRaw: 0n,
      routerPlan: null,
    };
  }

  if (!sourceA || !sourceB) {
    return {
      status: "unsupported-input-combination" as const,
      errorMessage: "Choose a compatible source for both sides.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  if (!canUseSourceKindForFamily(sourceA.family, sourceA.kind) || !canUseSourceKindForFamily(sourceB.family, sourceB.kind)) {
    return {
      status: "unsupported-input-combination" as const,
      errorMessage: "That source combination is not supported for this pool.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  const quote = quoteAmountsForActiveSide({
    pool,
    range,
    activeSide,
    activeAmountRaw,
  });

  if (!quote) {
    return {
      status: "unavailable-quote" as const,
      errorMessage: "Unable to calculate the quote for this range.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  const amountAUsedRaw = quote.amountAUsedRaw;
  const amountBUsedRaw = quote.amountBUsedRaw;

  if (amountAUsedRaw <= 0n || amountBUsedRaw <= 0n) {
    return {
      status: "invalid-range" as const,
      errorMessage: "Choose a range where both sides contribute liquidity.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw: null,
      amountBUsedRaw: null,
      amountAUnusedRaw: null,
      amountBUnusedRaw: null,
      liquidityRaw: null,
      amountAMinimumRaw: null,
      amountBMinimumRaw: null,
      routerPlan: null,
    };
  }

  const amountAUnusedRaw = balanceForSource(sourceA) >= amountAUsedRaw ? balanceForSource(sourceA) - amountAUsedRaw : 0n;
  const amountBUnusedRaw = balanceForSource(sourceB) >= amountBUsedRaw ? balanceForSource(sourceB) - amountBUsedRaw : 0n;

  if (amountAUsedRaw > balanceForSource(sourceA) || amountBUsedRaw > balanceForSource(sourceB)) {
    return {
      status: "insufficient-balance" as const,
      errorMessage: "One of the selected sources does not have enough balance.",
      activeSide,
      beginsInRange,
      activeAmountRaw,
      amountAUsedRaw,
      amountBUsedRaw,
      amountAUnusedRaw,
      amountBUnusedRaw,
      liquidityRaw: quote.liquidityRaw,
      amountAMinimumRaw: slippageAdjusted(amountAUsedRaw, slippageBps),
      amountBMinimumRaw: slippageAdjusted(amountBUsedRaw, slippageBps),
      routerPlan: null,
    };
  }

  const amountAMinimumRaw = slippageAdjusted(amountAUsedRaw, slippageBps);
  const amountBMinimumRaw = slippageAdjusted(amountBUsedRaw, slippageBps);

  const routerPlan: SlipstreamLiquidityPlan | null =
    receiver && deadline !== null
      ? {
          overload: `${sourceA.kind}-${sourceB.kind}`,
          inputA: routerInputForSource(sourceA, amountAUsedRaw),
          inputB: routerInputForSource(sourceB, amountBUsedRaw),
          params: {
            amountAMinimum: amountAMinimumRaw,
            amountBMinimum: amountBMinimumRaw,
            tickLower: range.tickLower,
            tickUpper: range.tickUpper,
            receiver,
            deadline,
          },
        }
      : null;

  return {
    status: "ok" as const,
    errorMessage: null,
    activeSide,
    beginsInRange,
    activeAmountRaw,
    amountAUsedRaw,
    amountBUsedRaw,
    amountAUnusedRaw,
    amountBUnusedRaw,
    liquidityRaw: quote.liquidityRaw,
    amountAMinimumRaw,
    amountBMinimumRaw,
    routerPlan,
  };
}
