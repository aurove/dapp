"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";
import {
  executePreparedWriteStep,
  isTokenApprovalSatisfied,
  makeTokenApprovalStep,
  type TokenApprovalRequirement,
} from "@/lib/tx-flow";
import type { ApprovalRequirement, SwapExecutionPlan } from "../domain";

function toTokenApprovalRequirement(
  approval: Exclude<ApprovalRequirement, { kind: "none" }>,
): TokenApprovalRequirement {
  if (approval.kind === "erc20") {
    return {
      standard: "erc20",
      token: approval.token,
      spender: approval.spender,
      amount: approval.amount,
    };
  }
  if (approval.kind === "erc721") {
    return {
      standard: "erc721",
      token: approval.token,
      operator: approval.operator,
      scope: { kind: "token", tokenId: approval.tokenId },
    };
  }
  return {
    standard: "erc1155",
    token: approval.token,
    operator: approval.operator,
  };
}

export function useSwapApproval(plan: SwapExecutionPlan | undefined) {
  const { address, chain } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync, isPending: isWalletPending } = useWriteContract();
  const queryClient = useQueryClient();
  const { contracts, notify } = useTxFlowRuntime();
  const [isExecutingApproval, setIsExecutingApproval] = useState(false);
  const approval = plan?.type === "unsupported" ? undefined : plan?.approval;
  const tokenApproval = approval && approval.kind !== "none"
    ? toTokenApprovalRequirement(approval)
    : undefined;
  const checkApproval = async () => {
    if (!address || !client || !tokenApproval) return true;
    return isTokenApprovalSatisfied({ account: address, publicClient: client }, tokenApproval);
  };
  const query = useQuery({
    queryKey: ["swap", "approval", address, approval?.kind, approval && approval.kind !== "none" ? approval.token : "none", approval?.kind === "erc20" ? approval.spender : approval?.kind === "erc1155" || approval?.kind === "erc721" ? approval.operator : "none", approval?.kind === "erc20" ? approval.amount.toString() : approval?.kind === "erc721" ? approval.tokenId.toString() : "0"],
    queryFn: checkApproval,
    enabled: Boolean(address && client && approval), staleTime: 5_000,
  });
  const approve = async () => {
    if (!address || !chain || !client || !tokenApproval || isExecutingApproval) return;
    setIsExecutingApproval(true);
    try {
      const step = makeTokenApprovalStep({
        key: `swap-approve-${tokenApproval.standard}`,
        label: "Approve token",
        approval: tokenApproval,
      });
      await executePreparedWriteStep(step, {
        account: address,
        chainId: chain.id,
        publicClient: client,
        writeAsync: writeContractAsync,
        contracts,
        notify,
        queryClient,
      });
      await query.refetch();
    } finally {
      setIsExecutingApproval(false);
    }
  };
  return {
    isApproved: query.data ?? false,
    isChecking: query.isLoading,
    isApproving: isWalletPending || isExecutingApproval,
    approve,
    verify: checkApproval,
  };
}
