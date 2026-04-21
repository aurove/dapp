import registry from "./registry";

type Registry = typeof registry;
type ChainContracts = Registry[keyof Registry];
export type RegistryContractName = keyof ChainContracts;

const DEFAULT_CHAIN_ID = 31337;

export function getContractConfig<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
) {
  const active = registry[chainId as keyof Registry] as ChainContracts | undefined;
  if (active?.[name]) return active[name];

  const fallback = registry[DEFAULT_CHAIN_ID as keyof Registry] as ChainContracts | undefined;
  return fallback?.[name] ?? null;
}
