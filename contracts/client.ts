import registry from "./registry";
import type { GenericContract } from "./types";

type Registry = typeof registry;
type ChainContracts = Registry[keyof Registry];
export type RegistryContractName = keyof ChainContracts;
export type RegistryChainId = keyof Registry & number;
export type RegistryContractConfig<TName extends RegistryContractName> = ChainContracts[TName] &
  GenericContract;
export type ContractsRegistry = ChainContracts;

const DEFAULT_CHAIN_ID = 31337;

export function getContractsByChainId(chainId: number): ChainContracts | null {
  const active = registry[chainId as keyof Registry] as ChainContracts | undefined;
  if (active) return active;
  return null;
}

export function getContractConfig<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): RegistryContractConfig<TName> | null {
  const active = getContractsByChainId(chainId);
  if (active?.[name]) {
    return active[name] as RegistryContractConfig<TName>;
  }

  const fallback = registry[DEFAULT_CHAIN_ID as keyof Registry] as ChainContracts | undefined;
  return (fallback?.[name] as RegistryContractConfig<TName> | undefined) ?? null;
}
