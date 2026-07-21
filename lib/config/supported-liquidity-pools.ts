import type { Abi, Address } from "viem";

import { getContractConfig } from "@/contracts/shared";

export const AUROVE_SUPPORTED_POOL_KEYS = ["MUSD-avBTCm", "avBTCm-avMEZOm"] as const;

export type AuroveSupportedPoolKey = (typeof AUROVE_SUPPORTED_POOL_KEYS)[number];

export type AuroveSupportedPool = {
  key: AuroveSupportedPoolKey;
  address: Address;
  abi: Abi;
};

export function getAuroveSupportedPools(chainId: number): AuroveSupportedPool[] {
  return AUROVE_SUPPORTED_POOL_KEYS.flatMap((key) => {
    const pool = getContractConfig(chainId, key);
    return pool?.address ? [{ key, address: pool.address, abi: pool.abi as Abi }] : [];
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
