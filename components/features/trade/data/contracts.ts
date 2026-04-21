"use client";

import type { Abi, Address } from "viem";
import { erc20Abi } from "viem";
import type { RegistryContractConfig } from "@/contracts/client";

export const LISTINGS_PAGE_SIZE = 100n;

type TradeListingTuple = {
  listingId: bigint;
  seller: Address;
  collection: Address;
  tokenId: bigint;
  amountRemaining: bigint;
  paymentToken: Address;
  pricePerUnit: bigint;
  totalPriceRemaining: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  expiry: bigint;
  status: number;
  isExpired: boolean;
  isActive: boolean;
};

export type ActiveListingsReadResult = readonly [readonly TradeListingTuple[], bigint, boolean];

type MinimalContractConfig = Pick<RegistryContractConfig<"Marketplace">, "address" | "abi">;

type BuildTradeBootstrapContractsParams = {
  marketplace: MinimalContractConfig | null;
  paymentRouter: Pick<RegistryContractConfig<"PaymentRouter">, "address" | "abi"> | null;
};

export function buildTradeBootstrapContracts({
  marketplace,
  paymentRouter,
}: BuildTradeBootstrapContractsParams) {
  const contracts: Array<{
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }> = [];

  if (marketplace?.address && marketplace.abi) {
    contracts.push({
      address: marketplace.address,
      abi: marketplace.abi,
      functionName: "getActiveListings",
      args: [0n, LISTINGS_PAGE_SIZE],
    });
  }

  if (paymentRouter?.address && paymentRouter.abi) {
    contracts.push({
      address: paymentRouter.address,
      abi: paymentRouter.abi,
      functionName: "MUSD",
    });
  }

  return contracts;
}

type BuildTradeMetadataContractsParams = {
  assetLedger: Pick<RegistryContractConfig<"AssetLedger">, "address" | "abi"> | null;
  trancheIds: bigint[];
  paymentTokens: Address[];
  defaultPaymentToken: Address | null;
};

export function buildTradeMetadataContracts({
  assetLedger,
  trancheIds,
  paymentTokens,
  defaultPaymentToken,
}: BuildTradeMetadataContractsParams) {
  const contracts: Array<{
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
  }> = [];

  let uriReads = 0;
  if (assetLedger?.address && assetLedger.abi) {
    for (const tokenId of trancheIds) {
      contracts.push({
        address: assetLedger.address,
        abi: assetLedger.abi,
        functionName: "uri",
        args: [tokenId],
      });
      uriReads += 1;
    }
  }

  for (const paymentToken of paymentTokens) {
    contracts.push({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "symbol",
    });
    contracts.push({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "decimals",
    });
  }

  let defaultPaymentDecimalsReadIndex: number | null = null;
  const hasDefaultPaymentTokenRead =
    defaultPaymentToken !== null &&
    paymentTokens.some(
      (paymentToken) => paymentToken.toLowerCase() === defaultPaymentToken.toLowerCase(),
    );
  if (defaultPaymentToken && !hasDefaultPaymentTokenRead) {
    defaultPaymentDecimalsReadIndex = contracts.length;
    contracts.push({
      address: defaultPaymentToken,
      abi: erc20Abi,
      functionName: "decimals",
    });
  }

  return {
    contracts,
    uriReads,
    paymentTokenReads: paymentTokens.length * 2,
    defaultPaymentDecimalsReadIndex,
  };
}

export function parseActiveListingsReadResult(value: unknown): TradeListingTuple[] {
  const tuple = value as ActiveListingsReadResult | undefined;
  if (!tuple || !Array.isArray(tuple[0])) {
    return [];
  }
  return [...tuple[0]];
}
