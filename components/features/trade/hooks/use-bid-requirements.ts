"use client";

import type { Address } from "viem";
import { useKnownMezoTokenBalance } from "@/components/shared/use-known-mezo-token-balance";

type UseBidRequirementsParams = {
  bidderAddress?: Address;
  paymentToken?: Address;
  paymentTokenSymbol?: string;
  paymentRouterAddress?: Address;
  requiredPaymentRaw: bigint;
  isNativePayment?: boolean;
  chainId?: number;
};

export function useBidRequirements({
  bidderAddress,
  paymentToken,
  paymentTokenSymbol,
  paymentRouterAddress,
  requiredPaymentRaw,
  chainId,
}: UseBidRequirementsParams) {
  const paymentTokenBalance = useKnownMezoTokenBalance({
    ownerAddress: bidderAddress,
    tokenAddress: paymentToken,
    tokenSymbol: paymentTokenSymbol,
    spenderAddress: paymentRouterAddress,
    chainId,
  });

  const balanceRaw = paymentTokenBalance.balanceRaw;
  const allowanceRaw = paymentTokenBalance.allowanceRaw;

  const hasEnoughBalance = requiredPaymentRaw <= 0n || balanceRaw >= requiredPaymentRaw;
  const hasEnoughAllowance = requiredPaymentRaw <= 0n || allowanceRaw >= requiredPaymentRaw;

  return {
    balanceRaw,
    allowanceRaw,
    hasEnoughBalance,
    hasEnoughAllowance,
    needsApproval: requiredPaymentRaw > 0n && !hasEnoughAllowance,
    isChecking: paymentTokenBalance.isChecking,
    error: paymentTokenBalance.error,
    refresh: paymentTokenBalance.refresh,
  };
}
