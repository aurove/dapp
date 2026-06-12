"use client";

import { erc721Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { detailReadQueryOptions } from "@/lib/web3/read-query-options";

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

  const reads = useReadContracts({
    allowFailure: true,
    contracts:
      sellerAddress && listingWorkflowContracts
        ? [
            ...(includeVeFlow && veNftCollectionAddress
              ? [
                  {
                    address: veNftCollectionAddress,
                    abi: erc721Abi,
                    functionName: "isApprovedForAll",
                    args: [sellerAddress, listingWorkflowContracts.listingWrapperAddress],
                    chainId,
                  },
                ]
              : []),
            {
              address: listingWorkflowContracts.assetLedgerAddress,
              abi: ERC1155_APPROVAL_ABI,
              functionName: "isApprovedForAll",
              args: [sellerAddress, listingWorkflowContracts.marketplaceAddress],
              chainId,
            },
          ]
        : [],
    query: {
      enabled: canReadSellerApprovals,
      ...detailReadQueryOptions,
    },
  });

  const veNftApprovalRead = reads.data?.[0]?.result;
  const fractionApprovalIndex = includeVeFlow && veNftCollectionAddress ? 1 : 0;
  const fractionApprovalRead = reads.data?.[fractionApprovalIndex]?.result;

  const veNftTransferApproved = includeVeFlow ? veNftApprovalRead === true : true;
  const fractionTransferApproved = fractionApprovalRead === true;

  const isChecking = reads.isPending || reads.isFetching;

  const anyError = (reads.error as Error | null) || null;

  const allApproved = veNftTransferApproved && fractionTransferApproved;

  function refresh() {
    void reads.refetch();
  }

  return {
    veNftTransferApproved,
    fractionTransferApproved,
    allApproved,
    isChecking,
    error: anyError,
    refresh,
  };
}
