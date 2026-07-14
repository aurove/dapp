import type { Abi, Address } from "viem";
import { erc721Abi, isAddress } from "viem";
import { getRuntimeConfig } from "@/lib/config/env";
import { type AppEnvironment } from "@/lib/config/chains";
import {
  EARN_VARIANTS,
  getManagedTrancheId,
  getManagedTrancheName,
  getManagedTrancheSymbol,
  getVariantAssetSymbol,
  type EarnVariant,
} from "./utils/tranche";

import { ILedger__factory } from "../../../../packages/core/typechain/factories/contracts/interfaces/ILedger__factory";
import { IRewardAccounting__factory } from "../../../../packages/core/typechain/factories/contracts/interfaces/IRewardAccounting__factory";
import { IRewardSink__factory } from "../../../../packages/core/typechain/factories/contracts/interfaces/IRewardSink__factory";
import { IVault__factory } from "../../../../packages/core/typechain/factories/contracts/interfaces/IVault__factory";
import { IVeNftManager__factory } from "../../../../packages/core/typechain/factories/contracts/interfaces/IVeNftManager__factory";
import { IVotingEscrow__factory } from "../../../../packages/core/typechain/factories/contracts/vendor/mezo/interfaces/IVotingEscrow__factory";
import { AuroveId20__factory } from "../../../../packages/id20/typechain/factories/src/aurove/AuroveId20__factory";
import { Id20Factory__factory } from "../../../../packages/id20/typechain/factories/src/aurove/Id20Factory__factory";
import { Id20Gauge__factory } from "../../../../packages/id20/typechain/factories/src/Id20Gauge__factory";

import localLedger from "../../../../packages/core/deployments/localhost/Ledger.json";
import localVault from "../../../../packages/core/deployments/localhost/Vault.json";
import localId20Factory from "../../../../packages/id20/deployments/localhost/Id20Factory.json";
import localVeBtc from "../../../../packages/marketplace/deployments/localhost/VeBTC.json";
import localVeMezo from "../../../../packages/marketplace/deployments/localhost/VeMEZO.json";
import testnetVeBtc from "../../../../packages/marketplace/deployments/testnet/VeBTC.json";
import testnetVeMezo from "../../../../packages/marketplace/deployments/testnet/VeMEZO.json";

export { EARN_VARIANTS, getManagedTrancheId, getManagedTrancheName, getManagedTrancheSymbol, getVariantAssetSymbol, type EarnVariant };

export const ledgerAbi = ILedger__factory.abi;
export const rewardAccountingAbi = IRewardAccounting__factory.abi;
export const rewardSinkAbi = IRewardSink__factory.abi;
export const vaultAbi = IVault__factory.abi;
export const veNftManagerAbi = IVeNftManager__factory.abi;
export const votingEscrowAbi = IVotingEscrow__factory.abi;
export const auroveId20Abi = AuroveId20__factory.abi;
export const id20FactoryAbi = Id20Factory__factory.abi;
export const id20GaugeAbi = Id20Gauge__factory.abi;
export const erc721ApprovalAbi = erc721Abi;
export const veNftCollectionAbi = localVeBtc.abi as Abi;

type NetworkAddressSource = {
  local?: Address;
  testnet?: Address;
  mainnet?: Address;
};

export type EarnProtocolAddresses = {
  ledgerAddress: Address | null;
  vaultAddress: Address | null;
  id20FactoryAddress: Address | null;
  veBtcAddress: Address | null;
  veMezoAddress: Address | null;
};

export type EarnVariantConfig = {
  variant: EarnVariant;
  assetSymbol: "BTC" | "MEZO";
  managedEpochs: number;
  trancheId: bigint;
  trancheName: string;
  trancheSymbol: string;
  collectionAddress: Address | null;
};

export type EarnProtocolRuntime = {
  environment: AppEnvironment;
  chainId: number;
  addresses: EarnProtocolAddresses;
};

function toAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value) ? value : null;
}

function pickAddress(
  environment: AppEnvironment,
  envValue: string | null | undefined,
  source: NetworkAddressSource,
): Address | null {
  const explicit = toAddress(envValue);
  if (explicit) return explicit;

  const fallback =
    environment === "local"
      ? source.local
      : environment === "testnet"
        ? source.testnet ?? source.local
        : source.mainnet ?? null;

  return fallback ?? null;
}

export function getEarnProtocolRuntime(chainId: number): EarnProtocolRuntime {
  const runtimeConfig = getRuntimeConfig();
  const environment = runtimeConfig.environment;

  return {
    environment,
    chainId,
    addresses: {
      ledgerAddress: pickAddress(environment, runtimeConfig.protocol.ledgerAddress, {
        local: localLedger.address as Address,
      }),
      vaultAddress: pickAddress(environment, runtimeConfig.protocol.vaultAddress, {
        local: localVault.address as Address,
      }),
      id20FactoryAddress: pickAddress(environment, runtimeConfig.protocol.id20FactoryAddress, {
        local: localId20Factory.address as Address,
      }),
      veBtcAddress: pickAddress(environment, runtimeConfig.trading.veBtcAddress, {
        local: localVeBtc.address as Address,
        testnet: testnetVeBtc.address as Address,
      }),
      veMezoAddress: pickAddress(environment, runtimeConfig.trading.veMezoAddress, {
        local: localVeMezo.address as Address,
        testnet: testnetVeMezo.address as Address,
      }),
    },
  };
}

export function getEarnVariantConfig(
  variant: EarnVariant,
  runtime: EarnProtocolRuntime,
): EarnVariantConfig {
  const trancheId = getManagedTrancheId(variant);

  return {
    variant,
    assetSymbol: getVariantAssetSymbol(variant),
    managedEpochs: variant === "veBTC" ? 4 : 208,
    trancheId,
    trancheName: getManagedTrancheName(variant),
    trancheSymbol: getManagedTrancheSymbol(variant),
    collectionAddress: variant === "veBTC" ? runtime.addresses.veBtcAddress : runtime.addresses.veMezoAddress,
  };
}

export function getEarnVariantCollectionAddress(
  variant: EarnVariant,
  runtime: EarnProtocolRuntime,
): Address | null {
  return getEarnVariantConfig(variant, runtime).collectionAddress;
}

export function getEarnVariantCollectionSymbol(variant: EarnVariant): string {
  return variant === "veBTC" ? "veBTC" : "veMEZO";
}

export function getEarnVariantOrder() {
  return EARN_VARIANTS;
}
