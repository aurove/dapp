"use client";

import type { Abi } from "viem";
import { getContractConfig } from "@/contracts/shared";
import type { SwapAsset, SwapPool, SwapRegistry } from "../domain";
import { getSwapPoolAbi, getSwapRoutingConfig } from "./swap-registry";

// v4: managed ID20 discovery no longer depends on scanning all week tranches.
const CACHE_VERSION = 4;
const CACHE_PREFIX = "aurove:swap-markets";

type CachedAsset = Omit<SwapAsset, "trancheId" | "epochs" | "tokenId" | "fixedInputAmount"> & {
  trancheId?: string;
  epochs?: string;
  tokenId?: string;
  fixedInputAmount?: string;
};

type CachedPool = Omit<SwapPool, "abi">;

interface CachedMarkets {
  version: number;
  chainId: number;
  deploymentSignature: string;
  revision: string;
  assets: CachedAsset[];
  pools: CachedPool[];
}

function cacheKey(chainId: number): string {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:${chainId}`;
}

function deploymentSignature(chainId: number): string | null {
  const names = ["CLSwapRouter", "AuroveZapRouter", "Ledger", "CLFactory", "Id20Factory"] as const;
  const addresses = names.map((name) => getContractConfig(chainId, name)?.address?.toLowerCase());
  return addresses.every(Boolean) ? addresses.join(":") : null;
}

function encodeAsset(asset: SwapAsset): CachedAsset {
  return {
    ...asset,
    trancheId: asset.trancheId?.toString(),
    epochs: asset.epochs?.toString(),
    tokenId: asset.tokenId?.toString(),
    fixedInputAmount: asset.fixedInputAmount?.toString(),
  };
}

function decodeAsset(asset: CachedAsset): SwapAsset {
  return {
    ...asset,
    trancheId: asset.trancheId === undefined ? undefined : BigInt(asset.trancheId),
    epochs: asset.epochs === undefined ? undefined : BigInt(asset.epochs),
    tokenId: asset.tokenId === undefined ? undefined : BigInt(asset.tokenId),
    fixedInputAmount: asset.fixedInputAmount === undefined ? undefined : BigInt(asset.fixedInputAmount),
  };
}

export function readCachedSwapMarkets(chainId: number): SwapRegistry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(cacheKey(chainId));
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CachedMarkets;
    const signature = deploymentSignature(chainId);
    const clRouter = getContractConfig(chainId, "CLSwapRouter");
    const auroveRouter = getContractConfig(chainId, "AuroveZapRouter");
    const ledger = getContractConfig(chainId, "Ledger");
    const abi = getSwapPoolAbi(chainId);
    if (cached.version !== CACHE_VERSION || cached.chainId !== chainId || !signature || cached.deploymentSignature !== signature || !clRouter?.address || !auroveRouter?.address || !ledger?.address || !abi) {
      window.localStorage.removeItem(cacheKey(chainId));
      return undefined;
    }
    return {
      chainId,
      revision: cached.revision,
      clRouter: { address: clRouter.address, abi: clRouter.abi as Abi },
      auroveRouter: { address: auroveRouter.address, abi: auroveRouter.abi as Abi },
      ledger: { address: ledger.address, abi: ledger.abi as Abi },
      assets: cached.assets.map(decodeAsset),
      pools: cached.pools.map((pool) => ({ ...pool, abi })),
      routing: getSwapRoutingConfig(),
    };
  } catch {
    window.localStorage.removeItem(cacheKey(chainId));
    return undefined;
  }
}

export function writeCachedSwapMarkets(registry: SwapRegistry): void {
  if (typeof window === "undefined") return;
  const signature = deploymentSignature(registry.chainId);
  if (!signature) return;
  const cached: CachedMarkets = {
    version: CACHE_VERSION,
    chainId: registry.chainId,
    deploymentSignature: signature,
    revision: registry.revision,
    assets: registry.assets.filter((asset) => asset.form !== "venft").map(encodeAsset),
    pools: registry.pools.map((pool) => ({
      key: pool.key,
      address: pool.address,
      token0: pool.token0,
      token1: pool.token1,
      tickSpacing: pool.tickSpacing,
      fee: pool.fee,
    })),
  };
  try {
    window.localStorage.setItem(cacheKey(registry.chainId), JSON.stringify(cached));
  } catch {
    // A full or unavailable storage area should never block live market loading.
  }
}
