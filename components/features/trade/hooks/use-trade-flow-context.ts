"use client";

import { useAccount, useChainId } from "wagmi";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";

export function useTradeFlowContext() {
  const { address: userAddress, isConnected } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = activeChain.id;
  const chainId = txFlowChainId ?? expectedChainId;

  return {
    userAddress,
    isConnected,
    activeChain,
    chainId,
    expectedChainId,
    isCorrectNetwork: chainId === expectedChainId,
    blockExplorerUrl: activeChain.blockExplorers?.default?.url ?? null,
  };
}
