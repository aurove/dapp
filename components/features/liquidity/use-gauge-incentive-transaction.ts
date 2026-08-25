"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address, type PublicClient } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import {
  MEZO_BRIBE_VOTING_REWARD_ABI,
  MEZO_VOTER_INCENTIVE_ABI,
} from "@/contracts/mezo-voting-incentives";
import type { GaugeIncentiveTarget } from "@/lib/config/supported-liquidity-pools";
import { notify } from "@/lib/notifications";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";
import { executePreparedWriteStep } from "@/lib/tx-flow/execute";
import { getParsedError } from "@/lib/tx-flow/getParsedError";
import type { TxFlowRuntimeContext, TxPreparedWriteStep, TxStepResult } from "@/lib/tx-flow/types";
import {
  deriveGaugeIncentiveEpoch,
  normalizeGaugeIncentiveError,
  type GaugeIncentiveTransactionState,
} from "./gauge-incentive-model";
import {
  buildGaugeIncentiveApprovalStep,
  buildGaugeIncentiveSubmissionStep,
  invalidateGaugeIncentiveQueries,
} from "./gauge-incentive-transactions";
import { readGaugeIncentiveTargetStatus } from "./use-gauge-incentive-data";

async function assertTokenAccepted(params: {
  publicClient: PublicClient;
  target: GaugeIncentiveTarget;
  tokenAddress: Address;
}) {
  const [isReward, whitelisted] = await Promise.all([
    params.publicClient.readContract({
      address: params.target.incentiveRecipientAddress,
      abi: MEZO_BRIBE_VOTING_REWARD_ABI,
      functionName: "isReward",
      args: [params.tokenAddress],
    }),
    params.publicClient.readContract({
      address: params.target.voterAddress,
      abi: MEZO_VOTER_INCENTIVE_ABI,
      functionName: "isWhitelistedToken",
      args: [params.tokenAddress],
    }),
  ]);
  if (!isReward && !whitelisted) {
    throw new Error("That token is no longer accepted for gauge incentives.");
  }
}

export function useGaugeIncentiveTransaction(target: GaugeIncentiveTarget) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const runtime = useTxFlowRuntime();
  const pendingRef = useRef(false);
  const [state, setState] = useState<GaugeIncentiveTransactionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TxStepResult | null>(null);

  const run = useCallback(
    async (params: {
      action: "approve" | "incentivise";
      tokenAddress: Address;
      amount: bigint;
      expectedEpochStart: bigint;
    }) => {
      if (pendingRef.current) return null;
      if (!address || !chain || !publicClient) {
        const message = "Connect your wallet on the supported network to continue.";
        setError(message);
        setState("error");
        return null;
      }
      if (params.amount <= 0n) {
        const message = "Enter an amount greater than zero.";
        setError(message);
        setState("error");
        return null;
      }

      pendingRef.current = true;
      setError(null);
      setLastResult(null);
      setState(params.action === "approve" ? "approving" : "incentivising");
      let transactionStarted = false;

      try {
        const client = publicClient as PublicClient;
        const [status, balance] = await Promise.all([
          readGaugeIncentiveTargetStatus(client, target),
          client.readContract({
            address: params.tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
          assertTokenAccepted({ publicClient: client, target, tokenAddress: params.tokenAddress }),
        ]);
        if (!status.available) throw new Error(status.reason ?? "This gauge is unavailable.");
        if (balance < params.amount) {
          throw new Error("The amount exceeds your connected-wallet balance.");
        }

        if (params.action === "incentivise") {
          const block = await client.getBlock({ blockTag: "latest" });
          const liveEpoch = deriveGaugeIncentiveEpoch(block.timestamp);
          if (liveEpoch.start !== params.expectedEpochStart) {
            await invalidateGaugeIncentiveQueries(queryClient, {
              chainId: chain.id,
              gaugeAddress: target.gaugeAddress,
              account: address,
              includePortfolio: false,
            });
            throw new Error(
              "The incentive epoch changed before submission. Review the refreshed epoch and try again.",
            );
          }
          const allowance = await client.readContract({
            address: params.tokenAddress,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, target.incentiveRecipientAddress],
          });
          if (allowance < params.amount) {
            throw new Error("Token approval is required before incentivising this gauge.");
          }
        }

        const ctx: TxFlowRuntimeContext = {
          account: address,
          chainId: chain.id,
          publicClient,
          writeAsync: writeContractAsync,
          contracts: runtime.contracts,
          notify: runtime.notify,
          queryClient,
        };
        const step: TxPreparedWriteStep = (params.action === "approve"
          ? buildGaugeIncentiveApprovalStep({
              target,
              tokenAddress: params.tokenAddress,
              amount: params.amount,
            })
          : buildGaugeIncentiveSubmissionStep({
              target,
              tokenAddress: params.tokenAddress,
              amount: params.amount,
            })) as unknown as TxPreparedWriteStep;

        transactionStarted = true;
        const execution = await executePreparedWriteStep(step, ctx);
        if (execution === "skip") return null;
        const result: TxStepResult = {
          key: step.key,
          label: step.label,
          skipped: false,
          hash: execution.hash,
          receipt: execution.receipt,
        };
        setLastResult(result);
        setState(params.action === "approve" ? "approval-success" : "incentive-success");
        await invalidateGaugeIncentiveQueries(queryClient, {
          chainId: chain.id,
          gaugeAddress: target.gaugeAddress,
          account: address,
          includePortfolio: params.action === "incentivise",
        });
        return result;
      } catch (caught) {
        const message = normalizeGaugeIncentiveError(getParsedError(caught));
        setError(message);
        setState("error");
        // Preflight failures happen before the shared transaction lifecycle creates a toast.
        if (!transactionStarted) notify.error("Gauge incentive failed", message);
        return null;
      } finally {
        pendingRef.current = false;
      }
    },
    [
      address,
      chain,
      publicClient,
      queryClient,
      runtime.contracts,
      runtime.notify,
      target,
      writeContractAsync,
    ],
  );

  return {
    state,
    error,
    lastResult,
    isPending: state === "approving" || state === "incentivising",
    approve: (params: { tokenAddress: Address; amount: bigint; expectedEpochStart: bigint }) =>
      run({ ...params, action: "approve" }),
    incentivise: (params: { tokenAddress: Address; amount: bigint; expectedEpochStart: bigint }) =>
      run({ ...params, action: "incentivise" }),
  };
}
