"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import { VE_NFT_PERMANENT_LOCK_ABI, isPermanentVeNftLock } from "@/lib/tx-flow/venft";
import { hasChainTimestampPassed } from "@/lib/web3/chain-time";
import { getPortfolioRegistry, invalidatePortfolioDomains } from "@/features/portfolio";
import type { SwapExecutionPlan, SwapQuote } from "../domain";

export type SwapExecutionState = "idle" | "reviewing" | "unlocking" | "depositing" | "submitting" | "pending" | "confirmed" | "failed-simulation" | "failed";

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
      if (hasChainTimestampPassed(latestBlock.timestamp, params.quote.expiresAtBlockTimestamp)) throw new Error("Quote expired. Refresh the quote before swapping.");
      if (hasChainTimestampPassed(latestBlock.timestamp, plan.deadline)) throw new Error("Swap deadline expired. Refresh the quote before swapping.");
      if (!(await params.verifyApproval())) throw new Error("Approval is required before swapping.");
      if (
        (plan.type === "auroveVeNftThenSwap" ||
          plan.type === "auroveVeNftDepositThenTrancheSwap") &&
        plan.veNft.isPermanent
      ) {
        const target = {
          contractAddress: plan.veNft.address,
          tokenId: plan.veNft.tokenId,
        };
        if (await isPermanentVeNftLock({ publicClient: client }, target)) {
          setState("unlocking");
          const unlockSimulation = await client.simulateContract({
            account: address,
            address: target.contractAddress,
            abi: VE_NFT_PERMANENT_LOCK_ABI,
            functionName: "unlockPermanent",
            args: [target.tokenId],
          } as Parameters<typeof client.simulateContract>[0]);
          const unlockHash = await writeContractAsync(unlockSimulation.request as never);
          await client.waitForTransactionReceipt({ hash: unlockHash });
          const portfolio = getPortfolioRegistry(plan.expectedAsset.chainId);
          if (portfolio) await invalidatePortfolioDomains({
            queryClient, chainId: plan.expectedAsset.chainId, owner: address,
            registryRevision: portfolio.revision, domains: ["wallet"],
          });
        }
      }
      if (plan.type === "auroveVeNftDepositThenTrancheSwap") {
        setState("depositing");
        let depositSimulation;
        try {
          depositSimulation = await client.simulateContract({
            account: address,
            address: plan.depositCall.address,
            abi: plan.depositCall.abi,
            functionName: plan.depositCall.functionName,
            args: plan.depositCall.args,
            value: plan.depositCall.value,
          } as Parameters<typeof client.simulateContract>[0]);
        } catch (caught) {
          setError(getParsedError(caught));
          setState("failed-simulation");
          return;
        }
        const depositHash = await writeContractAsync(depositSimulation.request as never);
        setHash(depositHash);
        await client.waitForTransactionReceipt({ hash: depositHash });

        setState("submitting");
        let swapSimulation;
        try {
          swapSimulation = await client.simulateContract({
            account: address,
            address: plan.swapCall.address,
            abi: plan.swapCall.abi,
            functionName: plan.swapCall.functionName,
            args: plan.swapCall.args,
            value: plan.swapCall.value,
          } as Parameters<typeof client.simulateContract>[0]);
        } catch (caught) {
          setError(getParsedError(caught));
          setState("failed-simulation");
          return;
        }
        const swapHash = await writeContractAsync(swapSimulation.request as never);
        setHash(swapHash);
        setState("pending");
        await client.waitForTransactionReceipt({ hash: swapHash });
        const portfolio = getPortfolioRegistry(plan.expectedAsset.chainId);
        if (portfolio) await invalidatePortfolioDomains({
          queryClient, chainId: plan.expectedAsset.chainId, owner: address,
          registryRevision: portfolio.revision, domains: plan.affectedPortfolioDomains,
        });
        await queryClient.invalidateQueries({ queryKey: ["swap", "balances", plan.expectedAsset.chainId, address.toLowerCase()] });
        await queryClient.invalidateQueries({ queryKey: ["swap", "registry", plan.expectedAsset.chainId] });
        setState("confirmed");
        return;
      }
      setState("submitting");
      let simulation;
      try {
        simulation = await client.simulateContract({
          account: address, address: plan.contractCall.address, abi: plan.contractCall.abi,
          functionName: plan.contractCall.functionName, args: plan.contractCall.args,
          value: plan.contractCall.value,
        } as Parameters<typeof client.simulateContract>[0]);
      } catch (caught) {
        setError(getParsedError(caught));
        setState("failed-simulation");
        return;
      }
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
      await queryClient.invalidateQueries({ queryKey: ["swap", "registry", plan.expectedAsset.chainId] });
      setState("confirmed");
    } catch (caught) {
      setError(getParsedError(caught));
      setState("failed");
    }
  };
  const reset = () => { setState("idle"); setHash(undefined); setError(undefined); };
  return { state, hash, error, review, cancelReview, submit, reset };
}
