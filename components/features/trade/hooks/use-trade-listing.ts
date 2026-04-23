"use client";

import { useCallback, useMemo } from "react";
import { parseUnits, erc20Abi, erc721Abi, type Address } from "viem";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { useReadContracts } from "wagmi";
import { useTradeFlowContext } from "./use-trade-flow-context";
import type {
  CreateFractionTradeListingInput,
  CreateVeTradeListingInput,
  TradeAsset,
} from "../types";

type TradePaymentTokenOption = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

const NATIVE_TOKEN_DECIMALS = 18;

export function useTradeListing() {
  const { chainId, blockExplorerUrl } = useTradeFlowContext();

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
      staleTime: 30_000,
      gcTime: 5 * 60_000,
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
      supportedPaymentTokens.flatMap((token) => {
        const isNativeLike =
          token.toLowerCase() === btcAddress?.toLowerCase() ||
          token.toLowerCase() === mezoAddress?.toLowerCase();
        if (isNativeLike) return [];

        return [
          {
            address: token,
            abi: erc20Abi,
            functionName: "symbol",
            chainId,
          },
          {
            address: token,
            abi: erc20Abi,
            functionName: "decimals",
            chainId,
          },
        ];
      }),
    [btcAddress, chainId, mezoAddress, supportedPaymentTokens],
  );

  const paymentTokenMetadataReads = useReadContracts({
    allowFailure: true,
    contracts: paymentTokenMetadataContracts,
    query: {
      enabled: supportedPaymentTokens.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const paymentTokenOptions = useMemo<TradePaymentTokenOption[]>(() => {
    const options: TradePaymentTokenOption[] = [];
    let metadataCursor = 0;

    for (const token of supportedPaymentTokens) {
      const isBtc = token.toLowerCase() === btcAddress?.toLowerCase();
      const isMezo = token.toLowerCase() === mezoAddress?.toLowerCase();
      const isMusd = token.toLowerCase() === musdAddress?.toLowerCase();

      if (isBtc) {
        options.push({ address: token, symbol: "BTC", decimals: NATIVE_TOKEN_DECIMALS });
        continue;
      }
      if (isMezo) {
        options.push({ address: token, symbol: "MEZO", decimals: NATIVE_TOKEN_DECIMALS });
        continue;
      }

      const symbolResult = paymentTokenMetadataReads.data?.[metadataCursor]?.result;
      const decimalsResult = paymentTokenMetadataReads.data?.[metadataCursor + 1]?.result;
      metadataCursor += 2;

      options.push({
        address: token,
        symbol:
          typeof symbolResult === "string"
            ? symbolResult
            : isMusd
              ? "MUSD"
              : `${token.slice(0, 6)}...${token.slice(-4)}`,
        decimals:
          typeof decimalsResult === "number"
            ? decimalsResult
            : typeof decimalsResult === "bigint"
              ? Number(decimalsResult)
              : 18,
      });
    }

    return options;
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

    const expiry =
      input.expiryMode === "none"
        ? 0n
        : BigInt(
            Math.floor(Date.now() / 1000) +
              Math.max(1, Math.floor(input.expiryDays)) * 24 * 60 * 60,
          );

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
        }),
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
        }),
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
        }),
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
      }),
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

    const expiry =
      input.expiryMode === "none"
        ? 0n
        : BigInt(
            Math.floor(Date.now() / 1000) +
              Math.max(1, Math.floor(input.expiryDays)) * 24 * 60 * 60,
          );

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
        }),
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
      }),
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
