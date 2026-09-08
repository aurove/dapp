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
import type { ApprovalRequirement, SingleApprovalRequirement, SwapExecutionPlan } from "../domain";

function toTokenApprovalRequirement(
  approval: SingleApprovalRequirement,
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

function approvalKey(approval: SingleApprovalRequirement): string {
  if (approval.kind === "erc20")
    return `erc20:${approval.token}:${approval.spender}:${approval.amount}`;
  if (approval.kind === "erc721")
    return `erc721:${approval.token}:${approval.operator}:${approval.tokenId}`;
  return `erc1155:${approval.token}:${approval.operator}`;
}

function flattenApprovals(approval: ApprovalRequirement | undefined): SingleApprovalRequirement[] {
  if (!approval || approval.kind === "none") return [];
  if (approval.kind === "batch") return [...approval.approvals];
  return [approval];
}

export function useSwapApproval(plan: SwapExecutionPlan | undefined) {
  const { address, chain } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync, isPending: isWalletPending } = useWriteContract();
  const queryClient = useQueryClient();
  const { contracts, notify } = useTxFlowRuntime();
  const [isExecutingApproval, setIsExecutingApproval] = useState(false);
  const approval = plan?.type === "unsupported" ? undefined : plan?.approval;
  const approvals = flattenApprovals(approval);
  const checkApproval = async () => {
    if (!address || !client || approvals.length === 0) return [] as boolean[];
    return Promise.all(
      approvals.map((item) =>
        isTokenApprovalSatisfied(
          { account: address, publicClient: client },
          toTokenApprovalRequirement(item),
        ),
      ),
    );
  };
  const query = useQuery({
    queryKey: ["swap", "approval", address, approvals.map(approvalKey).join("|")],
    queryFn: checkApproval,
    enabled: Boolean(address && client && approval), staleTime: 5_000,
  });
  const approve = async () => {
    if (!address || !chain || !client || approvals.length === 0 || isExecutingApproval) return;
    setIsExecutingApproval(true);
    try {
      const statuses = await checkApproval();
      const nextApproval = approvals.find((_, index) => !statuses[index]);
      if (!nextApproval) return;
      const tokenApproval = toTokenApprovalRequirement(nextApproval);
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
  const statuses = query.data ?? [];
  const pendingApproval = approvals.find((_, index) => statuses[index] !== true);
  return {
    isApproved: approvals.length === 0 || approvals.every((_, index) => statuses[index] === true),
    isChecking: query.isLoading,
    isApproving: isWalletPending || isExecutingApproval,
    pendingApproval,
    approve,
    verify: async () => (await checkApproval()).every(Boolean),
  };
}
