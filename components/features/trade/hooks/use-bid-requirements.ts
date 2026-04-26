"use client";

import { useMemo } from "react";
import { erc20Abi, type Address } from "viem";
import { useReadContracts } from "wagmi";

type UseBidRequirementsParams = {
  bidderAddress?: Address;
  paymentToken?: Address;
  paymentRouterAddress?: Address;
  requiredPaymentRaw: bigint;
  isNativePayment?: boolean;
  chainId?: number;
};

export function useBidRequirements({
  bidderAddress,
  paymentToken,
  paymentRouterAddress,
  requiredPaymentRaw,
  chainId,
}: UseBidRequirementsParams) {
  const contracts = useMemo(
    () =>
      bidderAddress && paymentToken && paymentRouterAddress
        ? [
            {
              address: paymentToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [bidderAddress],
              chainId,
            },
            {
              address: paymentToken,
              abi: erc20Abi,
              functionName: "allowance",
              args: [bidderAddress, paymentRouterAddress],
              chainId,
            },
          ]
        : [],
    [bidderAddress, chainId, paymentRouterAddress, paymentToken],
  );

  const reads = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: contracts.length > 0,
      staleTime: 10_000,
      gcTime: 5 * 60_000,
    },
  });

  const balanceRaw = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const allowanceRaw = (reads.data?.[1]?.result as bigint | undefined) ?? 0n;

  const hasEnoughBalance = requiredPaymentRaw <= 0n || balanceRaw >= requiredPaymentRaw;
  const hasEnoughAllowance = requiredPaymentRaw <= 0n || allowanceRaw >= requiredPaymentRaw;

  const anyError = (reads.error as Error | null) ?? null;

  function refresh() {
    void reads.refetch();
  }

  return {
    balanceRaw,
    allowanceRaw,
    hasEnoughBalance,
    hasEnoughAllowance,
    needsApproval: requiredPaymentRaw > 0n && !hasEnoughAllowance,
    isChecking: reads.isPending || reads.isFetching,
    error: anyError,
    refresh,
  };
}
