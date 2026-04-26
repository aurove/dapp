"use client";

import { useMemo } from "react";
import { erc20Abi } from "viem";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { useTradeFlowContext } from "./use-trade-flow-context";
import type { CreateTradeBidInput } from "../types";

export function useTradeBidding() {
  const { chainId } = useTradeFlowContext();

  const marketplace = getContractConfig(chainId, "Marketplace");
  const paymentRouter = getContractConfig(chainId, "PaymentRouter");

  const bidWorkflowContracts = useMemo(
    () =>
      marketplace?.address && marketplace.abi && paymentRouter?.address
        ? {
            marketplaceAddress: marketplace.address,
            paymentRouterAddress: paymentRouter.address,
          }
        : null,
    [marketplace, paymentRouter],
  );

  function createBidSteps(input: CreateTradeBidInput): TxStep[] {
    if (!marketplace?.address || !marketplace.abi) {
      throw new Error("Marketplace contract is unavailable for the connected network.");
    }
    if (!paymentRouter?.address) {
      throw new Error("PaymentRouter contract is unavailable for the connected network.");
    }
    if (!input.paymentToken) {
      throw new Error("Missing payment token for bid placement.");
    }
    if (input.bidAmountRaw <= 0n) {
      throw new Error("Bid amount must be greater than 0.");
    }
    if (input.bidPriceRaw <= 0n) {
      throw new Error("Bid price must be greater than 0.");
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

    const isNativePayment = input.paymentTokenSymbol === "BTC";

    if (input.requiresPaymentApproval && !isNativePayment) {
      steps.push(
        makeAddressWriteStep({
          key: "approve-bid-payment",
          label: `Approve ${input.paymentTokenSymbol}`,
          address: input.paymentToken,
          abi: erc20Abi,
          displayLabelBtn: true,
          variables: {
            functionName: "approve",
            args: [paymentRouter.address, input.requiredPaymentRaw],
          },
        }) as unknown as TxStep,
      );
    }

    steps.push(
      makeContractWriteStep({
        key: "place-bid",
        label: "Place Bid",
        contractName: "Marketplace",
        variables: {
          functionName: "placeBidWithExpiry",
          args: [
            input.collection,
            input.tokenId,
            input.bidAmountRaw,
            input.paymentToken,
            input.bidPriceRaw,
            expiry,
          ] as const,
          value: isNativePayment ? input.requiredPaymentRaw : undefined,
        },
      }) as unknown as TxStep,
    );

    return steps;
  }

  return {
    bidWorkflowContracts,
    createBidSteps,
    canPlaceBid: Boolean(marketplace?.address && marketplace.abi && paymentRouter?.address),
  };
}
