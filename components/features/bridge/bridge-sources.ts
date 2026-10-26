import type { Address } from "viem";
import type { HorizonBridgeAsset } from "@/lib/bridge/horizon";
import type { PortfolioSummary, WalletPortfolio } from "@/features/portfolio";
import { deriveTrancheId, MAX_EPOCHS_BY_VARIANT } from "@/components/features/earn/utils/tranche";

export type BridgeFamily = "veBTC" | "veMEZO";
export type BridgeMode = "deposit" | "withdraw";

export type BridgeSource =
  | {
      id: string;
      kind: "vault";
      family: BridgeFamily;
      symbol: string;
      label: string;
      token: Address;
      balanceRaw: bigint;
      decimals: number;
      asset: HorizonBridgeAsset;
    }
  | {
      id: string;
      kind: "id20";
      family: BridgeFamily;
      symbol: string;
      label: string;
      token: Address;
      balanceRaw: bigint;
      decimals: number;
      asset: HorizonBridgeAsset;
    }
  | {
      id: string;
      kind: "tranche";
      family: BridgeFamily;
      symbol: string;
      label: string;
      contractAddress: Address;
      trancheId: bigint;
      balanceRaw: bigint;
      decimals: number;
      asset: HorizonBridgeAsset;
    }
  | {
      id: string;
      kind: "venft";
      family: BridgeFamily;
      symbol: string;
      label: string;
      contractAddress: Address;
      tokenId: bigint;
      isPermanent: boolean;
      balanceRaw: bigint;
      decimals: number;
      asset: HorizonBridgeAsset;
    }
  | {
      id: string;
      kind: "peer";
      family: BridgeFamily;
      symbol: string;
      label: string;
      token: Address;
      balanceRaw: bigint;
      decimals: number;
      asset: HorizonBridgeAsset;
    };

export type BridgeFamilyConfig = {
  family: BridgeFamily;
  asset: HorizonBridgeAsset;
  vaultSymbol: string;
  id20Symbol: string;
  peerSymbol: string;
  vaultContract: "avBTCVault" | "avMEZOVault";
  peerContract: "avBTCvPeer" | "avMEZOvPeer";
  id20Contract: "avBTCmId20" | "avMEZOmId20";
  id20Key: "avBTCm" | "avMEZOm";
  veCollectionKey: "veBTC" | "veMEZO";
  ledgerVariant: 1 | 2;
  epochs: number;
};

export const BRIDGE_FAMILY_CONFIG: Record<BridgeFamily, BridgeFamilyConfig> = {
  veBTC: {
    family: "veBTC",
    asset: "avBTCv",
    vaultSymbol: "avBTCv",
    id20Symbol: "avBTCm",
    peerSymbol: "avBTCv",
    vaultContract: "avBTCVault",
    peerContract: "avBTCvPeer",
    id20Contract: "avBTCmId20",
    id20Key: "avBTCm",
    veCollectionKey: "veBTC",
    ledgerVariant: 1,
    epochs: MAX_EPOCHS_BY_VARIANT.veBTC,
  },
  veMEZO: {
    family: "veMEZO",
    asset: "avMEZOv",
    vaultSymbol: "avMEZOv",
    id20Symbol: "avMEZOm",
    peerSymbol: "avMEZOv",
    vaultContract: "avMEZOVault",
    peerContract: "avMEZOvPeer",
    id20Contract: "avMEZOmId20",
    id20Key: "avMEZOm",
    veCollectionKey: "veMEZO",
    ledgerVariant: 2,
    epochs: MAX_EPOCHS_BY_VARIANT.veMEZO,
  },
};

export function bridgeSourceKindLabel(source: BridgeSource) {
  if (source.kind === "vault") return "VAULT";
  if (source.kind === "id20") return "WRAPPED";
  if (source.kind === "tranche") return "LIQUID";
  if (source.kind === "venft") return "LOCKED";
  return "PEER";
}

export function bridgeSourceHelper(source: BridgeSource) {
  if (source.kind === "vault") {
    return `${source.symbol} vault shares bridge directly to Base via Wormhole NTT.`;
  }
  if (source.kind === "id20") {
    return `${source.symbol} is batched into the Horizon vault (EIP-5792 when supported), then bridged to Base.`;
  }
  if (source.kind === "tranche") {
    return `${source.label} is batched through wrap + vault deposit (EIP-5792 when supported), then bridged to Base.`;
  }
  if (source.kind === "venft") {
    return `${source.label} is batched through Earn deposit, wrap, and vault deposit (EIP-5792 when supported), then bridged to Base.`;
  }
  return `${source.symbol} peer tokens bridge from Base back to Mezo via Wormhole NTT.`;
}

export function resolveSelectedBridgeSource(
  sources: BridgeSource[],
  selectedId: string | null,
): BridgeSource | null {
  if (selectedId) {
    const selected = sources.find((source) => source.id === selectedId);
    if (selected) return selected;
  }
  return sources.find((source) => source.balanceRaw > 0n) ?? sources[0] ?? null;
}

export function buildBridgeSourceOptions(params: {
  mode: BridgeMode;
  family: BridgeFamily;
  portfolio: PortfolioSummary | undefined;
  veCollections: WalletPortfolio["veCollections"];
  ledgerAddress?: Address;
  vaultToken?: Address | null;
  vaultBalanceRaw: bigint;
  peerToken?: Address | null;
  peerBalanceRaw: bigint;
  id20Token?: Address | null;
}): BridgeSource[] {
  const config = BRIDGE_FAMILY_CONFIG[params.family];
  const sources: BridgeSource[] = [];

  if (params.mode === "deposit") {
    if (params.peerToken) {
      sources.push({
        id: `peer:${config.asset}`,
        kind: "peer",
        family: params.family,
        symbol: config.peerSymbol,
        label: `${config.peerSymbol} peer on Base`,
        token: params.peerToken,
        balanceRaw: params.peerBalanceRaw,
        decimals: 18,
        asset: config.asset,
      });
    }
    return sources;
  }

  if (params.vaultToken) {
    sources.push({
      id: `vault:${config.asset}`,
      kind: "vault",
      family: params.family,
      symbol: config.vaultSymbol,
      label: `${config.vaultSymbol} vault shares`,
      token: params.vaultToken,
      balanceRaw: params.vaultBalanceRaw,
      decimals: 18,
      asset: config.asset,
    });
  }

  const id20 = params.portfolio?.id20Balances[config.id20Key];
  const id20Token = params.id20Token ?? id20?.address;
  if (id20Token) {
    sources.push({
      id: `id20:${config.id20Key}`,
      kind: "id20",
      family: params.family,
      symbol: config.id20Symbol,
      label: `${config.id20Symbol} (wrapped)`,
      token: id20Token,
      balanceRaw: id20?.rawBalance ?? 0n,
      decimals: id20?.decimals ?? 18,
      asset: config.asset,
    });
  }

  if (params.ledgerAddress && id20Token) {
    const managedTrancheId = id20?.trancheId ?? deriveTrancheId(params.family, config.epochs);
    const tranche = Object.values(params.portfolio?.trancheBalances ?? {}).find(
      (item) => item.trancheId === managedTrancheId,
    );
    sources.push({
      id: `tranche:${managedTrancheId.toString()}`,
      kind: "tranche",
      family: params.family,
      symbol: tranche?.symbol ?? config.id20Symbol,
      label: `${tranche?.symbol ?? config.id20Symbol} (liquid)`,
      contractAddress: params.ledgerAddress,
      trancheId: managedTrancheId,
      balanceRaw: tranche?.rawBalance ?? 0n,
      decimals: 18,
      asset: config.asset,
    });
  }

  const collection = params.veCollections[config.veCollectionKey];
  if (collection?.address) {
    Object.values(collection.positions).forEach((position) => {
      sources.push({
        id: `venft:${config.veCollectionKey}:${position.tokenId.toString()}`,
        kind: "venft",
        family: params.family,
        symbol: config.veCollectionKey,
        label: `${config.veCollectionKey} #${position.tokenId.toString()}`,
        contractAddress: collection.address,
        tokenId: position.tokenId,
        isPermanent: position.isPermanent,
        balanceRaw: position.availableFractionCapacityRaw,
        decimals: 18,
        asset: config.asset,
      });
    });
  }

  return sources;
}
