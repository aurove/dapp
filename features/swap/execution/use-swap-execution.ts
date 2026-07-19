"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { getPortfolioRegistry, invalidatePortfolioDomains } from "@/features/portfolio";
import type { SwapExecutionPlan, SwapQuote } from "../domain";

export type SwapExecutionState = "idle" | "reviewing" | "submitting" | "pending" | "confirmed" | "failed";

export function useSwapExecution(params: { plan?: SwapExecutionPlan; quote?: SwapQuote; verifyApproval: () => Promise<boolean> }) {
  const { address } = useAccount();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<SwapExecutionState>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();
  const review = () => { setError(undefined); setState("reviewing"); };
  const cancelReview = () => setState("idle");
  const submit = async () => {
    const plan = params.plan;
    if (!address || !client || !plan || plan.type === "unsupported" || !params.quote) return;
    try {
      setError(undefined);
      const latestBlock = await client.getBlock({ blockTag: "latest" });
      if (latestBlock.timestamp - params.quote.quotedAtBlockTimestamp > 30n) throw new Error("Quote expired. Refresh the quote before swapping.");
      if (latestBlock.timestamp > plan.deadline) throw new Error("Swap deadline expired. Refresh the quote before swapping.");
      if (!(await params.verifyApproval())) throw new Error("Approval is required before swapping.");
      setState("submitting");
      const simulation = await client.simulateContract({
        account: address, address: plan.contractCall.address, abi: plan.contractCall.abi,
        functionName: plan.contractCall.functionName, args: plan.contractCall.args,
        value: plan.contractCall.value,
      } as Parameters<typeof client.simulateContract>[0]);
      const transactionHash = await writeContractAsync(simulation.request as never);
      setHash(transactionHash);
      setState("pending");
      await client.waitForTransactionReceipt({ hash: transactionHash });
      const portfolio = getPortfolioRegistry(plan.expectedAsset.chainId);
      if (portfolio) await invalidatePortfolioDomains({
        queryClient, chainId: plan.expectedAsset.chainId, owner: address,
        registryRevision: portfolio.revision, domains: plan.affectedPortfolioDomains,
      });
      await queryClient.invalidateQueries({ queryKey: ["swap", "balances", plan.expectedAsset.chainId, address.toLowerCase()] });
      await queryClient.invalidateQueries({ queryKey: ["swap", "registry", plan.expectedAsset.chainId, address.toLowerCase()] });
      setState("confirmed");
    } catch (caught) {
      setError(getParsedError(caught));
      setState("failed");
    }
  };
  const reset = () => { setState("idle"); setHash(undefined); setError(undefined); };
  return { state, hash, error, review, cancelReview, submit, reset };
}
