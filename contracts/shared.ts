import type { Abi, Address } from "viem";

import registry from "./registry";
import type { GenericContract } from "./types";

type Registry = typeof registry;
type ChainContracts = Registry[keyof Registry];
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ConfigForName<TName extends RegistryContractName> = TName extends unknown
  ? Extract<ChainContracts, Record<TName, GenericContract>>[TName]
  : never;

export type RegistryContractName = KeysOfUnion<ChainContracts>;
export type RegistryChainId = keyof Registry & number;
export type RegistryContractConfig<TName extends RegistryContractName> =
  ConfigForName<TName> & GenericContract;
export type ContractsRegistry = Partial<Record<RegistryContractName, GenericContract>>;

const DEFAULT_CHAIN_ID = 31337;

export function getContractsByChainId<TChainId extends RegistryChainId>(
  chainId: TChainId,
): Registry[TChainId] | null;
export function getContractsByChainId(chainId: number): ContractsRegistry | null;
export function getContractsByChainId(chainId: number): ContractsRegistry | null {
  const active = registry[chainId as keyof Registry] as ContractsRegistry | undefined;
  if (active) return active;
  return null;
}

export function getContractConfig<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): RegistryContractConfig<TName> | null {
  const active = getContractsByChainId(chainId);
  const activeContract = active?.[name];
  if (activeContract) {
    return activeContract as RegistryContractConfig<TName>;
  }

  const fallback = registry[DEFAULT_CHAIN_ID as keyof Registry] as ContractsRegistry | undefined;
  const fallbackContract = fallback?.[name];
  return (fallbackContract as RegistryContractConfig<TName> | undefined) ?? null;
}

export function getContractAbi<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): Abi | null {
  return getContractConfig(chainId, name)?.abi ?? null;
}

export function getContractAddress<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): Address | null {
  return getContractConfig(chainId, name)?.address ?? null;
}

export function getContractDeploymentBlock<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): number | null {
  const deploymentBlock = getContractConfig(chainId, name)?.deploymentBlock;
  return typeof deploymentBlock === "number" && Number.isInteger(deploymentBlock)
    ? deploymentBlock
    : null;
}
