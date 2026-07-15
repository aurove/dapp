import { erc721Abi, type Abi, type Address } from "viem";

import { getContractAbi, getContractAddress, getContractConfig } from "./shared";

export type EarnVariant = "veBTC" | "veMEZO";
export const EARN_VARIANTS = ["veBTC", "veMEZO"] as const;

export type EarnProtocolAddresses = {
  ledgerAddress: Address | null;
  vaultAddress: Address | null;
  id20FactoryAddress: Address | null;
  veBtcAddress: Address | null;
  veMezoAddress: Address | null;
};

export type EarnProtocolRuntime = {
  chainId: number;
  addresses: EarnProtocolAddresses;
};

export function getRewardSinkAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "avBTCmSink") as Abi | null;
}

export function getLedgerAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "Ledger") as Abi | null;
}

export function getVaultAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "Vault") as Abi | null;
}

export function getVotingEscrowAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "VeBTC") as Abi | null;
}

export function getAuroveId20Abi(chainId: number): Abi | null {
  return getContractAbi(chainId, "avBTCmId20") as Abi | null;
}

export function getId20FactoryAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "Id20Factory") as Abi | null;
}

export function getId20GaugeAbi(chainId: number): Abi | null {
  return getContractAbi(chainId, "avBTCmGauge") as Abi | null;
}

export function getVeNftCollectionAbi(chainId: number): Abi | null {
  return getVotingEscrowAbi(chainId);
}

export function getEarnProtocolAddresses(chainId: number): EarnProtocolAddresses {
  return {
    ledgerAddress: getContractAddress(chainId, "Ledger"),
    vaultAddress: getContractAddress(chainId, "Vault"),
    id20FactoryAddress: getContractAddress(chainId, "Id20Factory"),
    veBtcAddress: getContractAddress(chainId, "VeBTC"),
    veMezoAddress: getContractAddress(chainId, "VeMEZO"),
  };
}

export function getEarnProtocolRuntime(chainId: number): EarnProtocolRuntime {
  return {
    chainId,
    addresses: getEarnProtocolAddresses(chainId),
  };
}

export function getEarnProtocolConfig(chainId: number) {
  return {
    ledger: getContractConfig(chainId, "Ledger"),
    vault: getContractConfig(chainId, "Vault"),
    veBtc: getContractConfig(chainId, "VeBTC"),
    veMezo: getContractConfig(chainId, "VeMEZO"),
    id20Factory: getContractConfig(chainId, "Id20Factory"),
    rewardSink: getContractConfig(chainId, "avBTCmSink"),
    auroveId20: getContractConfig(chainId, "avBTCmId20"),
    id20Gauge: getContractConfig(chainId, "avBTCmGauge"),
    erc721ApprovalAbi: erc721Abi,
  };
}
