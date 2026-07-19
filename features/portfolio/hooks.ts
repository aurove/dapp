"use client";

import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { getPortfolioRegistry } from "./registry";
import { id20PortfolioOptions, liquidityPortfolioOptions, rewardsPortfolioOptions, tranchePortfolioOptions, walletPortfolioOptions } from "./queries";
import type { Id20Portfolio, LiquidityPortfolio, PortfolioSummary, RewardsPortfolio, TranchePortfolio, WalletPortfolio } from "./types";

function useContext() {
  const { address } = useAccount(); const chainId = useChainId(); const publicClient = usePublicClient();
  const registry = useMemo(() => getPortfolioRegistry(chainId), [chainId]);
  return { address, chainId, publicClient, registry, enabled: Boolean(address && publicClient && registry) };
}
function useDomain<T>(domain: string, options: ReturnType<typeof walletPortfolioOptions> | ReturnType<typeof tranchePortfolioOptions> | ReturnType<typeof id20PortfolioOptions> | ReturnType<typeof rewardsPortfolioOptions> | ReturnType<typeof liquidityPortfolioOptions> | null, chainId: number): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: options?.queryKey ?? ["portfolio", chainId, "disabled", domain],
    queryFn: options?.queryFn
      ? (options.queryFn as () => Promise<T>)
      : async () => {
          throw new Error("Portfolio query is disabled");
        },
    enabled: Boolean(options),
    staleTime: 15_000, gcTime: 10 * 60_000, retry: 2,
    refetchOnWindowFocus: true, refetchOnReconnect: true,
  });
}
export function useWalletPortfolio() { const c = useContext(); const o = c.enabled ? walletPortfolioOptions({ publicClient: c.publicClient!, chainId: c.chainId, owner: c.address!, registry: c.registry! }) : null; return useDomain<WalletPortfolio>("wallet", o, c.chainId); }
export function useTranchePortfolio() { const c = useContext(); const o = c.enabled ? tranchePortfolioOptions({ publicClient: c.publicClient!, chainId: c.chainId, owner: c.address!, registry: c.registry! }) : null; return useDomain<TranchePortfolio>("tranches", o, c.chainId); }
export function useId20Portfolio() { const c = useContext(); const o = c.enabled ? id20PortfolioOptions({ publicClient: c.publicClient!, chainId: c.chainId, owner: c.address!, registry: c.registry! }) : null; return useDomain<Id20Portfolio>("id20", o, c.chainId); }
export function useRewardsPortfolio() { const c = useContext(); const o = c.enabled ? rewardsPortfolioOptions({ publicClient: c.publicClient!, chainId: c.chainId, owner: c.address!, registry: c.registry! }) : null; return useDomain<RewardsPortfolio>("rewards", o, c.chainId); }
export function useLiquidityPortfolio() { const c = useContext(); const o = c.enabled ? liquidityPortfolioOptions({ publicClient: c.publicClient!, chainId: c.chainId, owner: c.address!, registry: c.registry! }) : null; return useDomain<LiquidityPortfolio>("liquidity", o, c.chainId); }

export function usePortfolioAsset(assetId: string) { const query = useWalletPortfolio(); return { ...query, data: query.data?.assets[assetId] }; }
export function useWalletAssetBalance(assetId: string) { const query = usePortfolioAsset(assetId); return { ...query, data: query.data?.rawBalance }; }
export function useTrancheBalance(trancheId: bigint) { const query = useTranchePortfolio(); const data = Object.values(query.data?.balances ?? {}).find((value) => value.trancheId === trancheId); return { ...query, data: data?.rawBalance }; }
export function useId20Balance(trancheId: bigint) { const query = useId20Portfolio(); const data = Object.values(query.data?.balances ?? {}).find((value) => value.trancheId === trancheId); return { ...query, data: data?.rawBalance }; }
export function useClaimableReward(key: string) { const query = useRewardsPortfolio(); return { ...query, data: query.data?.rewards[key] }; }
export function useLiquidityPosition(tokenId: bigint) { const query = useLiquidityPortfolio(); return { ...query, data: query.data?.positions[tokenId.toString()] }; }
export function useOwnedLiquidityPositionIds() { const query = useLiquidityPortfolio(); return { ...query, data: query.data?.positionIds ?? [] }; }
export function useHasPortfolioAssets() { const wallet = useWalletPortfolio(); const tranches = useTranchePortfolio(); const id20 = useId20Portfolio(); return { data: [...Object.values(wallet.data?.assets ?? {}), ...Object.values(tranches.data?.balances ?? {}), ...Object.values(id20.data?.balances ?? {})].some((item) => item.rawBalance > 0n), isLoading: wallet.isLoading || tranches.isLoading || id20.isLoading }; }

export function usePortfolioSummary() {
  const c = useContext(); const wallet = useWalletPortfolio(); const tranches = useTranchePortfolio(); const id20 = useId20Portfolio(); const rewards = useRewardsPortfolio(); const liquidity = useLiquidityPortfolio();
  const summary = useMemo<PortfolioSummary | undefined>(() => { if (!c.address) return undefined; const snapshots = [wallet.data, tranches.data, id20.data, rewards.data, liquidity.data].filter(Boolean); const blocks = snapshots.map((item) => item!.meta.blockNumber); return { owner: c.address, chainId: c.chainId, blockNumber: blocks.length ? blocks.reduce((oldest, block) => block < oldest ? block : oldest) : null, domainBlockNumbers: { wallet: wallet.data?.meta.blockNumber, tranches: tranches.data?.meta.blockNumber, id20: id20.data?.meta.blockNumber, rewards: rewards.data?.meta.blockNumber, liquidity: liquidity.data?.meta.blockNumber }, walletAssets: wallet.data?.assets ?? {}, trancheBalances: tranches.data?.balances ?? {}, id20Balances: id20.data?.balances ?? {}, rewards: rewards.data?.rewards ?? {}, liquidityPositions: liquidity.data?.positions ?? {}, failures: snapshots.flatMap((item) => item!.meta.failures) }; }, [c.address, c.chainId, wallet.data, tranches.data, id20.data, rewards.data, liquidity.data]);
  return { data: summary, domains: { wallet, tranches, id20, rewards, liquidity }, isLoading: wallet.isLoading || tranches.isLoading || id20.isLoading || rewards.isLoading || liquidity.isLoading, isFetching: wallet.isFetching || tranches.isFetching || id20.isFetching || rewards.isFetching || liquidity.isFetching };
}
