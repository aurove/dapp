import type { Abi, Address } from "viem";
import { getContractConfig, getContractsByChainId, type RegistryContractName } from "@/contracts/shared";
import { getKnownMezoTokenConfigs } from "@/components/shared/known-mezo-tokens";
import { deriveTrancheId, MAX_EPOCHS_BY_VARIANT, symbolOf } from "@/components/features/earn/utils/tranche";
import { getAuroveSupportedPools, type AuroveSupportedPoolKey } from "@/lib/config/supported-liquidity-pools";
import type { PortfolioRegistry } from "./types";

const CL_GAUGE_BY_POOL: Record<AuroveSupportedPoolKey, RegistryContractName> = {
  "MUSD-avBTCm": "MUSD-avBTCmGauge",
  "avBTCm-avMEZOm": "avBTCm-avMEZOmGauge",
};

export function getPortfolioRegistry(chainId: number): PortfolioRegistry | null {
  if (!getContractsByChainId(chainId)) return null;
  const ledger = getContractConfig(chainId, "Ledger");
  const rewardAbi = getContractConfig(chainId, "avBTCmSink")?.abi;
  if (!ledger?.address || !ledger.abi || !rewardAbi) return null;

  const variants = ["veBTC", "veMEZO"] as const;
  const tranches = variants.map((variant, index) => {
    const epochs = MAX_EPOCHS_BY_VARIANT[variant];
    return { key: `${variant}:${epochs}`, trancheId: deriveTrancheId(variant, epochs), variant: index + 1, epochs, symbol: symbolOf(variant, epochs) };
  });
  const wrapperEntries = [
    { key: "avBTCm", name: "avBTCmId20", tranche: tranches.find((item) => item.key === `veBTC:${MAX_EPOCHS_BY_VARIANT.veBTC}`) },
    { key: "avMEZOm", name: "avMEZOmId20", tranche: tranches.find((item) => item.key === `veMEZO:${MAX_EPOCHS_BY_VARIANT.veMEZO}`) },
  ] as const;
  const id20s = wrapperEntries.flatMap(({ key, name, tranche }) => {
    const contract = getContractConfig(chainId, name);
    return contract?.address && tranche ? [{ key, trancheId: tranche.trancheId, address: contract.address, symbol: key, decimals: 18 }] : [];
  });
  const walletAssets = getKnownMezoTokenConfigs(chainId).map((token) => ({ id: token.symbol, ...token, type: "erc20" as const }));
  const rewardSources = [
    { key: "avBTCm", sink: getContractConfig(chainId, "avBTCmSink")?.address, token: walletAssets.find((a) => a.id === "BTC") },
    { key: "avMEZOm", sink: getContractConfig(chainId, "avMEZOmSink")?.address, token: walletAssets.find((a) => a.id === "MEZO") },
  ].flatMap(({ key, sink, token }) => sink && token ? [{ key, address: sink, rewardToken: token.address, symbol: token.symbol, decimals: token.decimals, assetId: token.id }] : []);
  const positionManager = getContractConfig(chainId, "NonfungiblePositionManager");
  const factory = getContractConfig(chainId, "CLFactory");
  const supportedPools = getAuroveSupportedPools(chainId);
  const vault = getContractConfig(chainId, "Vault");
  const veCollections = [
    { key: "veBTC", contract: getContractConfig(chainId, "VeBTC") },
    { key: "veMEZO", contract: getContractConfig(chainId, "VeMEZO") },
  ].flatMap(({ key, contract }) => contract?.address ? [{ key, address: contract.address, symbol: key, abi: contract.abi as Abi }] : []);
  const clGauges = supportedPools.flatMap((pool) => {
    const gaugeName = CL_GAUGE_BY_POOL[pool.key];
    if (!gaugeName) return [];
    const gauge = getContractConfig(chainId, gaugeName);
    if (!gauge?.address) return [];
    const linked = gauge.linkedData as { rewardToken?: string } | undefined;
    const rewardToken = typeof linked?.rewardToken === "string" && linked.rewardToken.startsWith("0x")
      ? linked.rewardToken as Address
      : undefined;
    return [{
      key: String(gaugeName),
      poolKey: pool.key,
      pool: pool.address,
      address: gauge.address,
      abi: gauge.abi as Abi,
      rewardToken,
    }];
  });
  const revisionParts = [ledger.address, ...tranches.map((item) => item.trancheId.toString()), ...walletAssets.map((a) => a.address), ...id20s.map((a) => a.address), ...rewardSources.map((a) => a.address), ...veCollections.map((a) => a.address), ...supportedPools.map((pool) => pool.address), ...clGauges.map((gauge) => gauge.address), positionManager?.address].filter(Boolean);

  return {
    revision: revisionParts.map((value) => String(value).toLowerCase()).join(":"),
    walletAssets,
    tranches,
    id20s,
    rewardSources,
    veCollections,
    ledger: ledger.address,
    ledgerAbi: ledger.abi as Abi,
    rewardSinkAbi: rewardAbi as Abi,
    vault: vault?.address ? { address: vault.address, abi: vault.abi as Abi } : undefined,
    positionManager: positionManager?.address ? { address: positionManager.address, abi: positionManager.abi as Abi } : undefined,
    factory: factory?.address ? { address: factory.address, abi: factory.abi as Abi } : undefined,
    supportedPools,
    clGauges,
  };
}
