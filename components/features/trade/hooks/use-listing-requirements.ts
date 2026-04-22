"use client";

import { erc721Abi, type Address } from "viem";
import { useReadContract } from "wagmi";

const MARKETPLACE_OPERATOR_ABI = [
  {
    inputs: [
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isListingOperator",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC1155_APPROVAL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "address", name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type ListingWorkflowContracts = {
  listingWrapperAddress: `0x${string}`;
  assetLedgerAddress: `0x${string}`;
  marketplaceAddress: `0x${string}`;
};

type UseListingRequirementsParams = {
  sellerAddress?: Address;
  veNftCollectionAddress?: Address;
  listingWorkflowContracts: ListingWorkflowContracts | null;
  chainId?: number;
  includeVeFlow?: boolean;
};

export function useListingRequirements({
  sellerAddress,
  veNftCollectionAddress,
  listingWorkflowContracts,
  chainId,
  includeVeFlow = true,
}: UseListingRequirementsParams) {
  const canReadSellerApprovals = Boolean(sellerAddress && listingWorkflowContracts);
  const canReadVeNftApproval = Boolean(
    includeVeFlow && sellerAddress && veNftCollectionAddress && listingWorkflowContracts,
  );

  const veNftApprovalRead = useReadContract({
    address: veNftCollectionAddress,
    abi: erc721Abi,
    functionName: "isApprovedForAll",
    args:
      sellerAddress && listingWorkflowContracts
        ? [sellerAddress, listingWorkflowContracts.listingWrapperAddress]
        : undefined,
    chainId,
    query: {
      enabled: canReadVeNftApproval,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
    },
  });

  const marketplaceOperatorRead = useReadContract({
    address: listingWorkflowContracts?.marketplaceAddress,
    abi: MARKETPLACE_OPERATOR_ABI,
    functionName: "isListingOperator",
    args:
      sellerAddress && listingWorkflowContracts
        ? [sellerAddress, listingWorkflowContracts.listingWrapperAddress]
        : undefined,
    chainId,
    query: {
      enabled: canReadSellerApprovals && includeVeFlow,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionApprovalRead = useReadContract({
    address: listingWorkflowContracts?.assetLedgerAddress,
    abi: ERC1155_APPROVAL_ABI,
    functionName: "isApprovedForAll",
    args:
      sellerAddress && listingWorkflowContracts
        ? [sellerAddress, listingWorkflowContracts.marketplaceAddress]
        : undefined,
    chainId,
    query: {
      enabled: canReadSellerApprovals,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
    },
  });

  const veNftTransferApproved = includeVeFlow ? veNftApprovalRead.data === true : true;
  const marketplaceOperatorApproved = includeVeFlow ? marketplaceOperatorRead.data === true : true;
  const fractionTransferApproved = fractionApprovalRead.data === true;

  const isChecking =
    (includeVeFlow && (veNftApprovalRead.isPending || veNftApprovalRead.isFetching)) ||
    (includeVeFlow && (marketplaceOperatorRead.isPending || marketplaceOperatorRead.isFetching)) ||
    fractionApprovalRead.isPending ||
    fractionApprovalRead.isFetching;

  const anyError =
    (includeVeFlow ? (veNftApprovalRead.error as Error | null) : null) ||
    (includeVeFlow ? (marketplaceOperatorRead.error as Error | null) : null) ||
    (fractionApprovalRead.error as Error | null) ||
    null;

  const allApproved =
    veNftTransferApproved && marketplaceOperatorApproved && fractionTransferApproved;

  function refresh() {
    void veNftApprovalRead.refetch();
    void marketplaceOperatorRead.refetch();
    void fractionApprovalRead.refetch();
  }

  return {
    veNftTransferApproved,
    marketplaceOperatorApproved,
    fractionTransferApproved,
    allApproved,
    isChecking,
    error: anyError,
    refresh,
  };
}
