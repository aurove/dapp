"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { usePortfolioSummary } from "@/features/portfolio";
import type { SwapAsset, SwapRegistry } from "../domain";
import { findClRoute } from "../routing";

function selectorRank(asset: SwapAsset, side: "sell" | "buy"): number {
  if (side === "sell") {
    if (asset.form === "venft") return 0;
    if (asset.form === "tranche") return 1;
    return 2;
  }
  return asset.form === "id20" ? 0 : 1;
}

function compareSelectorAssets(a: SwapAsset, b: SwapAsset, side: "sell" | "buy"): number {
  const rankDifference = selectorRank(a, side) - selectorRank(b, side);
  if (rankDifference !== 0) return rankDifference;
  const variantDifference = (a.variant ?? Number.MAX_SAFE_INTEGER) - (b.variant ?? Number.MAX_SAFE_INTEGER);
  if ((a.form === "venft" || a.form === "tranche") && variantDifference !== 0) return variantDifference;
  const epochDifference = Number(a.epochs ?? 0n) - Number(b.epochs ?? 0n);
  if (a.form === "tranche" && epochDifference !== 0) return epochDifference;
  if (a.form === "venft" && b.form === "venft" && a.tokenId !== b.tokenId) return (a.tokenId ?? 0n) < (b.tokenId ?? 0n) ? -1 : 1;
  return a.symbol.localeCompare(b.symbol, undefined, { numeric: true, sensitivity: "base" });
}

export function useSwapAssets(registry: SwapRegistry | undefined, opposite: SwapAsset | undefined, side: "sell" | "buy") {
  const portfolio = usePortfolioSummary();
  const { address } = useAccount();
  const client = usePublicClient();
  const dynamicFungibleAssets = useMemo(() => registry?.assets.filter((asset) => asset.form === "underlying" || asset.form === "erc20" || asset.form === "id20") ?? [], [registry]);
  const trancheAssets = useMemo(() => registry?.assets.filter((asset) => asset.form === "tranche") ?? [], [registry]);
  const discoveredBalances = useQuery({
    queryKey: ["swap", "balances", registry?.chainId, address?.toLowerCase(), registry?.revision],
    queryFn: async () => {
      if (!client || !address) return {} as Record<string, bigint>;
      const results = await client.multicall({ allowFailure: true, contracts: [
        ...dynamicFungibleAssets.map((asset) => ({ address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })),
        ...trancheAssets.map((asset) => ({ address: registry!.ledger.address, abi: registry!.ledger.abi, functionName: "balanceOf", args: [address, asset.trancheId!] })),
      ] });
      const assets = [...dynamicFungibleAssets, ...trancheAssets];
      return Object.fromEntries(assets.map((asset, index) => {
        const result = results[index];
        return [asset.id, result?.status === "success" && typeof result.result === "bigint" ? result.result : 0n];
      }));
    },
    enabled: Boolean(client && address && registry && (dynamicFungibleAssets.length || trancheAssets.length)), staleTime: 15_000,
  });
  const assets = useMemo(() => {
    if (!registry) return [];
    return registry.assets.filter((asset) => {
      const allowed = side === "sell"
        ? asset.form === "underlying" || asset.form === "venft" || asset.form === "tranche" || asset.form === "id20" || asset.form === "erc20"
        : asset.form === "id20" || asset.form === "erc20";
      if (!allowed) return false;
      if (!opposite) return true;
      if (asset.id === opposite.id) return false;
      if (side === "sell" && (asset.form === "venft" || asset.form === "tranche")) return true;
      const tokenIn = side === "sell" ? asset.executableAddress : opposite.executableAddress;
      const tokenOut = side === "sell" ? opposite.executableAddress : asset.executableAddress;
      return Boolean(findClRoute(registry.pools, tokenIn, tokenOut, registry.routing.maxHops));
    }).sort((a, b) => compareSelectorAssets(a, b, side));
  }, [opposite, registry, side]);
  const balanceOf = (asset: SwapAsset): bigint => {
    if (asset.form === "venft") return asset.fixedInputAmount ?? 0n;
    if (asset.form === "tranche" && asset.trancheId !== undefined) {
      const tranche = Object.values(portfolio.data?.trancheBalances ?? {}).find((item) => item.trancheId === asset.trancheId);
      if (tranche) return tranche.rawBalance;
    }
    if (asset.form === "id20") {
      const id20 = Object.values(portfolio.data?.id20Balances ?? {}).find((item) => item.address.toLowerCase() === asset.address.toLowerCase());
      if (id20) return id20.rawBalance;
    }
    if (asset.form === "erc20" || asset.form === "underlying") {
      const walletAsset = Object.values(portfolio.data?.walletAssets ?? {}).find((item) => item.address.toLowerCase() === asset.address.toLowerCase());
      if (walletAsset) return walletAsset.rawBalance;
    }
    const dynamic = discoveredBalances.data?.[asset.id];
    if (dynamic !== undefined) return dynamic;
    if (asset.balanceDomain === "wallet") return portfolio.data?.walletAssets[asset.balanceKey]?.rawBalance ?? 0n;
    if (asset.balanceDomain === "tranches") return portfolio.data?.trancheBalances[asset.balanceKey]?.rawBalance ?? 0n;
    return portfolio.data?.id20Balances[asset.balanceKey]?.rawBalance ?? 0n;
  };
  return {
    assets,
    balanceOf,
    isLoading: portfolio.domains.wallet.isLoading || portfolio.domains.tranches.isLoading || portfolio.domains.id20.isLoading || discoveredBalances.isLoading,
  };
}
