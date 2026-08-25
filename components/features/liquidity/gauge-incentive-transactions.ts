import type { QueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address } from "viem";

import { MEZO_BRIBE_VOTING_REWARD_ABI } from "@/contracts/mezo-voting-incentives";
import type { GaugeIncentiveTarget } from "@/lib/config/supported-liquidity-pools";
import { makeAddressWriteStep } from "@/lib/tx-flow/steps";
import { gaugeIncentiveKeys } from "./gauge-incentive-model";

type InvalidationParams = {
  chainId: number;
  gaugeAddress: Address;
  account: Address;
  includePortfolio: boolean;
};

export async function invalidateGaugeIncentiveQueries(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  params: InvalidationParams,
) {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: gaugeIncentiveKeys.gauge(params.chainId, params.gaugeAddress),
    }),
  ];
  if (params.includePortfolio) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: ["portfolio", params.chainId, params.account.toLowerCase()],
      }),
    );
  }
  await Promise.all(invalidations);
}

export function buildGaugeIncentiveApprovalStep(params: {
  target: GaugeIncentiveTarget;
  tokenAddress: Address;
  amount: bigint;
}) {
  return makeAddressWriteStep({
    key: "gauge-incentive-approve",
    label: "Approve incentive token",
    address: params.tokenAddress,
    abi: erc20Abi,
    variables: {
      functionName: "approve",
      args: [params.target.incentiveRecipientAddress, params.amount],
    },
  });
}

export function buildGaugeIncentiveSubmissionStep(params: {
  target: GaugeIncentiveTarget;
  tokenAddress: Address;
  amount: bigint;
}) {
  return makeAddressWriteStep({
    key: "gauge-incentive-submit",
    label: "Incentivise gauge",
    address: params.target.incentiveRecipientAddress,
    abi: MEZO_BRIBE_VOTING_REWARD_ABI,
    variables: {
      functionName: "notifyRewardAmount",
      args: [params.tokenAddress, params.amount],
    },
  });
}
