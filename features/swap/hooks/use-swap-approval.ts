"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, erc721Abi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { SwapExecutionPlan, SwapRegistry } from "../domain";

export function useSwapApproval(plan: SwapExecutionPlan | undefined, registry: SwapRegistry | undefined) {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync, isPending: isWalletPending } = useWriteContract();
  const approval = plan?.type === "unsupported" ? undefined : plan?.approval;
  const checkApproval = async () => {
    if (!address || !client || !approval || approval.kind === "none") return true;
    if (approval.kind === "erc20") {
      const allowance = await client.readContract({ address: approval.token, abi: erc20Abi, functionName: "allowance", args: [address, approval.spender] });
      return allowance >= approval.amount;
    }
    if (approval.kind === "erc721") {
      const approved = await client.readContract({ address: approval.token, abi: erc721Abi, functionName: "getApproved", args: [approval.tokenId] });
      if (approved.toLowerCase() === approval.operator.toLowerCase()) return true;
      return client.readContract({ address: approval.token, abi: erc721Abi, functionName: "isApprovedForAll", args: [address, approval.operator] });
    }
    if (!registry) return false;
    return client.readContract({ address: approval.token, abi: registry.ledger.abi, functionName: "isApprovedForAll", args: [address, approval.operator] }) as Promise<boolean>;
  };
  const query = useQuery({
    queryKey: ["swap", "approval", address, approval?.kind, approval && approval.kind !== "none" ? approval.token : "none", approval?.kind === "erc20" ? approval.spender : approval?.kind === "erc1155" || approval?.kind === "erc721" ? approval.operator : "none", approval?.kind === "erc20" ? approval.amount.toString() : approval?.kind === "erc721" ? approval.tokenId.toString() : "0"],
    queryFn: checkApproval,
    enabled: Boolean(address && client && approval && registry), staleTime: 5_000,
  });
  const approve = async () => {
    if (!address || !client || !approval || approval.kind === "none" || !registry) return;
    const simulation = approval.kind === "erc20"
      ? await client.simulateContract({ account: address, address: approval.token, abi: erc20Abi, functionName: "approve", args: [approval.spender, approval.amount] })
      : approval.kind === "erc721"
        ? await client.simulateContract({ account: address, address: approval.token, abi: erc721Abi, functionName: "approve", args: [approval.operator, approval.tokenId] })
        : await client.simulateContract({ account: address, address: approval.token, abi: registry.ledger.abi, functionName: "setApprovalForAll", args: [approval.operator, true] });
    const hash = await writeContractAsync(simulation.request as never);
    await client.waitForTransactionReceipt({ hash });
    await query.refetch();
  };
  return { isApproved: query.data ?? false, isChecking: query.isLoading, isApproving: isWalletPending, approve, verify: checkApproval };
}
