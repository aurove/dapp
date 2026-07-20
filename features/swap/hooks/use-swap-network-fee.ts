"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import type { SwapExecutionPlan } from "../domain";

export function useSwapNetworkFee(plan: SwapExecutionPlan | undefined, enabled: boolean) {
  const { address } = useAccount();
  const client = usePublicClient();
  return useQuery({
    queryKey: ["swap", "network-fee", address, plan?.type === "unsupported" ? "unsupported" : plan?.contractCall.address, plan?.type === "unsupported" ? "" : plan?.encodedPath, plan?.type === "unsupported" ? "" : plan?.amountSpecified.toString(), plan?.type === "unsupported" ? "" : plan?.amountOutMinimum.toString(), plan?.type === "unsupported" ? "" : plan?.amountInMaximum.toString()],
    queryFn: async () => {
      if (!address || !client || !plan || plan.type === "unsupported") return null;
      const [gas, gasPrice] = await Promise.all([
        client.estimateContractGas({ account: address, address: plan.contractCall.address, abi: plan.contractCall.abi, functionName: plan.contractCall.functionName, args: plan.contractCall.args, value: plan.contractCall.value } as Parameters<typeof client.estimateContractGas>[0]),
        client.getGasPrice(),
      ]);
      const raw = gas * gasPrice;
      return formatCompactRawTokenAmount(raw, 18, "BTC");
    },
    enabled: Boolean(enabled && address && client && plan && plan.type !== "unsupported"),
    staleTime: 15_000, retry: false,
  });
}
