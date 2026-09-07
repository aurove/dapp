import { type Abi, type Address } from "viem";

import { makeAddressWriteStep } from "./steps";
import type { TxFlowRuntimeContext, TxStep } from "./types";

export const VE_NFT_PERMANENT_LOCK_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "locked",
    outputs: [
      { internalType: "int128", name: "amount", type: "int128" },
      { internalType: "uint256", name: "end", type: "uint256" },
      { internalType: "bool", name: "isPermanent", type: "bool" },
      { internalType: "uint256", name: "boost", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "unlockPermanent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const satisfies Abi;

export type PermanentVeNftUnlockTarget = {
  contractAddress: Address;
  tokenId: bigint;
  isPermanent?: boolean;
};

function decodeIsPermanent(locked: unknown): boolean {
  if (Array.isArray(locked)) return Boolean(locked[2]);
  if (locked && typeof locked === "object" && "isPermanent" in locked) {
    return Boolean((locked as { isPermanent?: unknown }).isPermanent);
  }
  return false;
}

export async function isPermanentVeNftLock(
  ctx: Pick<TxFlowRuntimeContext, "publicClient">,
  target: PermanentVeNftUnlockTarget,
): Promise<boolean> {
  const locked = await ctx.publicClient.readContract({
    address: target.contractAddress,
    abi: VE_NFT_PERMANENT_LOCK_ABI,
    functionName: "locked",
    args: [target.tokenId],
  });
  return decodeIsPermanent(locked);
}

export function makeUnlockPermanentVeNftStep(target: PermanentVeNftUnlockTarget): TxStep {
  return makeAddressWriteStep({
    key: `unlock-permanent-venft-${target.contractAddress}-${target.tokenId.toString()}`,
    label: "Unlock permanent veNFT",
    displayLabelBtn: true,
    address: target.contractAddress,
    abi: VE_NFT_PERMANENT_LOCK_ABI,
    shouldSkip: async (ctx) => !(await isPermanentVeNftLock(ctx, target)),
    variables: {
      functionName: "unlockPermanent",
      args: [target.tokenId],
    },
  }) as unknown as TxStep;
}

export function permanentVeNftUnlockSteps(
  targets: readonly (PermanentVeNftUnlockTarget | null | undefined)[],
): TxStep[] {
  const seen = new Set<string>();
  const steps: TxStep[] = [];

  for (const target of targets) {
    if (!target?.isPermanent) continue;
    const key = `${target.contractAddress.toLowerCase()}:${target.tokenId.toString()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push(makeUnlockPermanentVeNftStep(target));
  }

  return steps;
}
