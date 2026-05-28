"use client";

import { useCallback, useMemo } from "react";
import { parseUnits, erc721Abi, type Address } from "viem";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { useChainTime } from "@/lib/web3/use-chain-time";
import { useReadContracts } from "wagmi";
import { useTradeFlowContext } from "./use-trade-flow-context";
import type {
  CreateFractionTradeListingInput,
  CreateVeTradeListingInput,
  TradeAsset,
} from "../types";
import { buildErc20MetadataContracts, parseErc20MetadataReads } from "../utils/token-metadata";

type TradePaymentTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

const NATIVE_TOKEN_DECIMALS = 18;

export function useTradeListing() {
  const { chainId, blockExplorerUrl } = useTradeFlowContext();
  const { chainTimestamp } = useChainTime();

  const listingWrapper = getContractConfig(chainId, "VeNftFractionListing");
  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");

  const paymentTokenConfigContracts = useMemo(
    () =>
      paymentRouter?.address && paymentRouter.abi
        ? [
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "getSupportedTokens",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "BTC",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "MEZO",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "MUSD",
              chainId,
            },
            {
              address: paymentRouter.address,
              abi: paymentRouter.abi,
              functionName: "protocolFeeBps",
              chainId,
            },
          ]
        : [],
    [chainId, paymentRouter],
  );

  const paymentTokenConfigReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenConfigContracts,
    query: {
      enabled: Boolean(paymentRouter?.address && paymentRouter.abi),
      ...staticReadQueryOptions,
    },
  });

  const supportedPaymentTokens = useMemo(() => {
    const routerTokens = paymentTokenConfigReads.data?.[0]?.result;
    return Array.isArray(routerTokens)
      ? (routerTokens.filter((token): token is Address => typeof token === "string") as Address[])
      : ([] as Address[]);
  }, [paymentTokenConfigReads.data]);

  const btcAddress = paymentTokenConfigReads.data?.[1]?.result as Address | undefined;
  const mezoAddress = paymentTokenConfigReads.data?.[2]?.result as Address | undefined;
  const musdAddress = paymentTokenConfigReads.data?.[3]?.result as Address | undefined;
  const protocolFeeBpsResult = paymentTokenConfigReads.data?.[4]?.result;
  const protocolFeeBps =
    typeof protocolFeeBpsResult === "bigint"
      ? Number(protocolFeeBpsResult)
      : typeof protocolFeeBpsResult === "number"
        ? protocolFeeBpsResult
        : null;

  const paymentTokenMetadataContracts = useMemo(
    () =>
      buildErc20MetadataContracts({
        chainId,
        tokens: supportedPaymentTokens,
        skipToken: (token) => {
          const normalized = token.toLowerCase();
          return (
            normalized === btcAddress?.toLowerCase() ||
            normalized === mezoAddress?.toLowerCase() ||
            normalized === musdAddress?.toLowerCase()
          );
        },
      }),
    [btcAddress, chainId, mezoAddress, musdAddress, supportedPaymentTokens],
  );

  const paymentTokenMetadataReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenMetadataContracts,
    query: {
      enabled: supportedPaymentTokens.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const paymentTokenOptions = useMemo<TradePaymentTokenOption[]>(() => {
    const presetByToken: Record<string, { symbol: string; decimals: number }> = {};
    if (btcAddress) {
      presetByToken[btcAddress.toLowerCase()] = {
        symbol: "BTC",
        decimals: NATIVE_TOKEN_DECIMALS,
      };
    }
    if (mezoAddress) {
      presetByToken[mezoAddress.toLowerCase()] = {
        symbol: "MEZO",
        decimals: NATIVE_TOKEN_DECIMALS,
      };
    }
    if (musdAddress) {
      presetByToken[musdAddress.toLowerCase()] = {
        symbol: "MUSD",
        decimals: NATIVE_TOKEN_DECIMALS,
      };
    }

    const options = parseErc20MetadataReads({
      tokens: supportedPaymentTokens,
      reads: paymentTokenMetadataReads.data,
      presetByToken,
      fallbackDecimals: 18,
    }).map((token) => ({
      address: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
    }));

    if (
      musdAddress &&
      !options.some((token) => token.address.toLowerCase() === musdAddress.toLowerCase())
    ) {
      options.unshift({
        address: musdAddress,
        symbol: "MUSD",
        decimals: NATIVE_TOKEN_DECIMALS,
      });
    }

    return [...options].sort((a, b) => {
      const aMusd = a.symbol.toLowerCase() === "musd";
      const bMusd = b.symbol.toLowerCase() === "musd";
      if (aMusd && !bMusd) return -1;
      if (!aMusd && bMusd) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [
    supportedPaymentTokens,
    btcAddress,
    mezoAddress,
    musdAddress,
    paymentTokenMetadataReads.data,
  ]);

  const refreshPaymentTokens = useCallback(() => {
    void paymentTokenConfigReads.refetch();
    void paymentTokenMetadataReads.refetch();
  }, [paymentTokenConfigReads, paymentTokenMetadataReads]);

  function createVeListingSteps(input: CreateVeTradeListingInput) {
    if (!listingWrapper?.address || !listingWrapper.abi) {
      throw new Error("VeNftFractionListing contract is unavailable for the connected network.");
    }
    if (!assetLedger?.address || !assetLedger.abi) {
      throw new Error("AssetLedger contract is unavailable for the connected network.");
    }
    if (!marketplace?.address || !marketplace.abi) {
      throw new Error("Marketplace contract is unavailable for the connected network.");
    }
    if (!input.veNftAddress) {
      throw new Error("Missing selected ve token contract address.");
    }
    if (!input.paymentToken) {
      throw new Error(
        "No payment token selected. Configure PaymentRouter supported tokens and pick one.",
      );
    }
    if (input.expiryMode === "timed" && input.expiryDays < 1) {
      throw new Error("Expiry must be at least 1 day.");
    }
    let expiry = 0n;
    if (input.expiryMode === "timed") {
      if (chainTimestamp === null) {
        throw new Error("Current chain time is unavailable.");
      }
      expiry = chainTimestamp + BigInt(Math.max(1, Math.floor(input.expiryDays)) * 24 * 60 * 60);
    }

    const steps: TxStep[] = [];

    if (input.requiresVeNftApproval) {
      steps.push(
        makeAddressWriteStep({
          key: "approve-venft",
          label: "Approve",
          address: input.veNftAddress,
          abi: erc721Abi,
          displayLabelBtn: true,
          variables: {
            functionName: "setApprovalForAll",
            args: [listingWrapper.address, true],
          },
        }) as unknown as TxStep,
      );
    }

    if (input.requiresListingOperatorApproval) {
      steps.push(
        makeContractWriteStep({
          key: "approve-marketplace-operator",
          label: "Approve Marketplace",
          contractName: "Marketplace",
          variables: {
            functionName: "setListingOperator",
            args: [listingWrapper.address, true],
          },
        }) as unknown as TxStep,
      );
    }

    if (input.requiresFractionTransferApproval) {
      steps.push(
        makeContractWriteStep({
          key: "approve-fraction-transfer",
          label: "Approve Fraction Transfer",
          contractName: "AssetLedger",
          variables: {
            functionName: "setApprovalForAll",
            args: [marketplace.address, true],
          },
        }) as unknown as TxStep,
      );
    }

    steps.push(
      makeContractWriteStep({
        key: "fractionalize-list",
        label: "List Asset",
        contractName: "VeNftFractionListing",
        variables: {
          functionName: "fractionalizeAndList",
          args: [
            input.veNftAddress,
            input.veNftTokenId,
            parseUnits(input.listAmount, 18),
            input.paymentToken,
            parseUnits(input.unitPrice, input.paymentTokenDecimals),
            expiry,
          ],
        },
      }) as unknown as TxStep,
    );

    return steps;
  }

  function createFractionListingSteps(input: CreateFractionTradeListingInput) {
    if (!assetLedger?.address || !assetLedger.abi) {
      throw new Error("AssetLedger contract is unavailable for the connected network.");
    }
    if (!marketplace?.address || !marketplace.abi) {
      throw new Error("Marketplace contract is unavailable for the connected network.");
    }
    if (!input.paymentToken) {
      throw new Error(
        "No payment token selected. Configure PaymentRouter supported tokens and pick one.",
      );
    }
    if (input.expiryMode === "timed" && input.expiryDays < 1) {
      throw new Error("Expiry must be at least 1 day.");
    }
    let expiry = 0n;
    if (input.expiryMode === "timed") {
      if (chainTimestamp === null) {
        throw new Error("Current chain time is unavailable.");
      }
      expiry = chainTimestamp + BigInt(Math.max(1, Math.floor(input.expiryDays)) * 24 * 60 * 60);
    }

    const steps: TxStep[] = [];

    if (input.requiresFractionTransferApproval) {
      steps.push(
        makeContractWriteStep({
          key: "approve-fraction-transfer",
          label: "Approve Fraction Transfer",
          contractName: "AssetLedger",
          variables: {
            functionName: "setApprovalForAll",
            args: [marketplace.address, true],
          },
        }) as unknown as TxStep,
      );
    }

    steps.push(
      makeContractWriteStep({
        key: "create-fraction-listing",
        label: "List Fractions",
        contractName: "Marketplace",
        variables: {
          functionName: "createListingWithExpiry",
          args: [
            assetLedger.address,
            input.trancheId,
            parseUnits(input.listAmount, 18),
            input.paymentToken,
            parseUnits(input.unitPrice, input.paymentTokenDecimals),
            expiry,
          ],
        },
      }) as unknown as TxStep,
    );

    return steps;
  }

  function mapCreatedListingAsset(input: CreateVeTradeListingInput, hash: string): TradeAsset {
    return {
      id: hash,
      name: `${input.veAssetType} Fraction #${input.veNftTokenId.toString()}`,
      symbol: `${input.veAssetType}-${input.veNftTokenId.toString()}`,
      thumbnail: input.veAssetType === "veBTC" ? "🟧" : "🟩",
      priceUsd: Number(input.unitPrice),
      volume24hUsd: 0,
      change24hPct: undefined,
      category: "locked",
    } satisfies TradeAsset;
  }

  function mapCreatedFractionListingAsset(
    input: CreateFractionTradeListingInput,
    hash: string,
  ): TradeAsset {
    return {
      id: hash,
      name: "Fraction Position",
      symbol: "FRACTION",
      thumbnail: "🧩",
      priceUsd: Number(input.unitPrice),
      volume24hUsd: 0,
      change24hPct: undefined,
      category: "locked",
    } satisfies TradeAsset;
  }

  return {
    listingWorkflowContracts:
      listingWrapper?.address && assetLedger?.address && marketplace?.address
        ? {
            listingWrapperAddress: listingWrapper.address,
            assetLedgerAddress: assetLedger.address,
            marketplaceAddress: marketplace.address,
          }
        : null,
    blockExplorerUrl,
    paymentTokenOptions,
    protocolFeeBps,
    isLoadingPaymentTokens:
      paymentTokenConfigReads.isPending || paymentTokenMetadataReads.isPending,
    isFetchingPaymentTokens:
      paymentTokenConfigReads.isFetching || paymentTokenMetadataReads.isFetching,
    paymentTokenError:
      (paymentTokenConfigReads.error as Error | null) ||
      (paymentTokenMetadataReads.error as Error | null),
    refreshPaymentTokens,
    createVeListingSteps,
    createFractionListingSteps,
    canCreateListing: Boolean(
      marketplace?.address && marketplace.abi && assetLedger?.address && assetLedger.abi,
    ),
    mapCreatedListingAsset,
    mapCreatedFractionListingAsset,
  };
}
