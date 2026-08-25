import type { Abi, Address } from "viem";
import { getAddress, isAddress, zeroAddress } from "viem";

import { getContractConfig, getContractsByChainId } from "@/contracts/shared";

export const AUROVE_LIQUIDITY_PAIRS = [
  {
    key: "BTC",
    routeSlug: "btc",
    poolContractName: "MUSD-avBTCm",
    gaugeContractName: "MUSD-avBTCmGauge",
    pairLabel: "MUSD / avBTCm",
    title: "Add liquidity to MUSD / avBTCm",
    description:
      "Choose your funding assets and configure the price range for this Aurove BTC pool.",
  },
  {
    key: "MEZO",
    routeSlug: "mezo",
    poolContractName: "avBTCm-avMEZOm",
    gaugeContractName: "avBTCm-avMEZOmGauge",
    pairLabel: "avBTCm / avMEZOm",
    title: "Add liquidity to avBTCm / avMEZOm",
    description:
      "Choose your funding assets and configure the price range for this Aurove BTC and MEZO pool.",
  },
] as const;

export type AuroveLiquidityPair = (typeof AUROVE_LIQUIDITY_PAIRS)[number];
export type AuroveLiquidityPairKey = AuroveLiquidityPair["key"];
export type AuroveLiquidityPoolContractName = AuroveLiquidityPair["poolContractName"];
export type AuroveLiquidityGaugeContractName = AuroveLiquidityPair["gaugeContractName"];

export const AUROVE_SUPPORTED_POOL_KEYS = AUROVE_LIQUIDITY_PAIRS.map(
  (pair) => pair.poolContractName,
) as readonly AuroveLiquidityPoolContractName[];

export type AuroveSupportedPoolKey = (typeof AUROVE_SUPPORTED_POOL_KEYS)[number];

export type AuroveSupportedPool = {
  key: AuroveSupportedPoolKey;
  address: Address;
  abi: Abi;
  deploymentBlock?: number;
};

export type RuntimeContractConfig = {
  address?: Address;
  abi?: Abi;
  deploymentBlock?: number;
  linkedData?: Readonly<Record<string, unknown>>;
};

export type GaugeIncentiveTarget = {
  pair: AuroveLiquidityPair;
  poolAddress: Address;
  gaugeAddress: Address;
  voterAddress: Address;
  incentiveRecipientAddress: Address;
  candidateTokenAddresses: readonly Address[];
};

export type GaugeIncentiveTargetResolution =
  | { available: true; target: GaugeIncentiveTarget; reason: null }
  | { available: false; target: null; reason: string };

function asNonZeroAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  const address = getAddress(value);
  return address.toLowerCase() === zeroAddress ? null : address;
}

function exactChainContracts(chainId: number): Record<string, RuntimeContractConfig> | null {
  return getContractsByChainId(chainId) as unknown as Record<string, RuntimeContractConfig> | null;
}

export function getAuroveLiquidityPair(key: AuroveLiquidityPairKey): AuroveLiquidityPair {
  return AUROVE_LIQUIDITY_PAIRS.find((pair) => pair.key === key)!;
}

export function resolveAuroveLiquidityPairRoute(routeSlug: string): AuroveLiquidityPair | null {
  const normalized = routeSlug.trim().toLowerCase();
  return AUROVE_LIQUIDITY_PAIRS.find((pair) => pair.routeSlug === normalized) ?? null;
}

/**
 * Resolve the complete CL voting-incentive path from one exact-chain registry entry.
 * No fallback chain is used: silently borrowing another network's gauge would be unsafe.
 */
export function resolveGaugeIncentiveTarget(
  chainId: number,
  pairKey: AuroveLiquidityPairKey,
): GaugeIncentiveTargetResolution {
  const contracts = exactChainContracts(chainId);
  if (!contracts) {
    return {
      available: false,
      target: null,
      reason: "Gauge incentives are not configured for this network.",
    };
  }

  return resolveGaugeIncentiveTargetFromContracts(contracts, pairKey);
}

export function resolveGaugeIncentiveTargetFromContracts(
  contracts: Readonly<Record<string, RuntimeContractConfig>>,
  pairKey: AuroveLiquidityPairKey,
): GaugeIncentiveTargetResolution {
  const pair = getAuroveLiquidityPair(pairKey);

  const poolConfig = contracts[pair.poolContractName];
  const gaugeConfig = contracts[pair.gaugeContractName];
  const poolAddress = asNonZeroAddress(poolConfig?.address);
  if (!poolAddress) {
    return {
      available: false,
      target: null,
      reason: `${pair.pairLabel} is not configured for this network.`,
    };
  }
  if (!gaugeConfig) {
    return {
      available: false,
      target: null,
      reason: `The ${pair.pairLabel} voting gauge has not been configured on this network.`,
    };
  }

  const linked = gaugeConfig.linkedData;
  const gaugeAddress = asNonZeroAddress(gaugeConfig.address);
  const linkedPoolAddress = asNonZeroAddress(linked?.pool);
  const voterAddress = asNonZeroAddress(linked?.voter);
  const incentiveRecipientAddress = asNonZeroAddress(linked?.bribeVotingReward);
  const tokenA = asNonZeroAddress(linked?.tokenA);
  const tokenB = asNonZeroAddress(linked?.tokenB);

  if (
    !gaugeAddress ||
    !linkedPoolAddress ||
    linkedPoolAddress.toLowerCase() !== poolAddress.toLowerCase() ||
    linked?.poolKey !== pair.poolContractName ||
    !voterAddress ||
    !incentiveRecipientAddress
  ) {
    return {
      available: false,
      target: null,
      reason: `The ${pair.pairLabel} gauge deployment is incomplete or does not match its pool.`,
    };
  }

  return {
    available: true,
    reason: null,
    target: {
      pair,
      poolAddress,
      gaugeAddress,
      voterAddress,
      incentiveRecipientAddress,
      candidateTokenAddresses: [tokenA, tokenB].filter(
        (address): address is Address => address !== null,
      ),
    },
  };
}

export function getAuroveSupportedPools(chainId: number): AuroveSupportedPool[] {
  return AUROVE_SUPPORTED_POOL_KEYS.flatMap((key) => {
    const pool = getContractConfig(chainId, key);
    return pool?.address
      ? [
          {
            key,
            address: pool.address,
            abi: pool.abi as Abi,
            deploymentBlock: pool.deploymentBlock,
          },
        ]
      : [];
  });
}

export function getAuroveSupportedPool(
  chainId: number,
  address: string,
): AuroveSupportedPool | null {
  return (
    getAuroveSupportedPools(chainId).find(
      (pool) => pool.address.toLowerCase() === address.toLowerCase(),
    ) ?? null
  );
}
