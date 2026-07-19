"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { Address, Hash } from "viem";
import { useAccount, useChainId } from "wagmi";
import type { PortfolioDomain } from "./types";

export interface PendingPortfolioDelta {
  transactionHash: Hash;
  chainId: number;
  owner: Address;
  domain: PortfolioDomain;
  assetKey: string;
  rawDelta: bigint;
  status: "pending" | "confirmed" | "failed";
}

type PendingPortfolioState = {
  deltas: PendingPortfolioDelta[];
  add: (delta: PendingPortfolioDelta) => void;
  settle: (hash: Hash, status: "confirmed" | "failed") => void;
  remove: (hash: Hash) => void;
  retainAccount: (chainId: number, owner: Address | undefined) => void;
};

export const usePendingPortfolioStore = create<PendingPortfolioState>((set) => ({
  deltas: [],
  add: (delta) => set((state) => ({ deltas: [...state.deltas.filter((item) => !(item.transactionHash === delta.transactionHash && item.domain === delta.domain && item.assetKey === delta.assetKey)), delta] })),
  settle: (hash, status) => set((state) => ({ deltas: state.deltas.map((item) => item.transactionHash === hash ? { ...item, status } : item) })),
  remove: (hash) => set((state) => ({ deltas: state.deltas.filter((item) => item.transactionHash !== hash) })),
  retainAccount: (chainId, owner) => set((state) => ({ deltas: owner ? state.deltas.filter((item) => item.chainId === chainId && item.owner.toLowerCase() === owner.toLowerCase()) : [] })),
}));

export function usePendingPortfolioAccountGuard() {
  const { address } = useAccount(); const chainId = useChainId(); const retainAccount = usePendingPortfolioStore((state) => state.retainAccount);
  useEffect(() => retainAccount(chainId, address), [address, chainId, retainAccount]);
}

export function useDisplayedPortfolioBalance(domain: PortfolioDomain, assetKey: string, confirmedRaw: bigint) {
  const { address } = useAccount(); const chainId = useChainId();
  const pendingDelta = usePendingPortfolioStore((state) => state.deltas.filter((item) => item.status === "pending" && item.chainId === chainId && item.owner.toLowerCase() === address?.toLowerCase() && item.domain === domain && item.assetKey === assetKey).reduce((total, item) => total + item.rawDelta, 0n));
  return { confirmedRaw, pendingDelta, displayedRaw: confirmedRaw + pendingDelta };
}
