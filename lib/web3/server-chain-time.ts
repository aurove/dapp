import "server-only";

import { createPublicClient, http, type Chain } from "viem";

import { supportedChains } from "@/lib/config/chains";
import { logServerError } from "@/lib/server/http";

type ServerPublicClient = ReturnType<typeof createPublicClient>;

const clientCache = new Map<string, ServerPublicClient>();

function getChainById(chainId: number): Chain | null {
  return supportedChains.find((chain) => chain.id === chainId) ?? null;
}

function getServerChainRpcUrl(chain: Chain): string | null {
  const url = chain.rpcUrls.default.http[0]?.trim();
  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return null;
}

export function getServerPublicClient(chainId: number): ServerPublicClient | null {
  const chain = getChainById(chainId);
  if (!chain) {
    return null;
  }

  const rpcUrl = getServerChainRpcUrl(chain);
  if (!rpcUrl) {
    return null;
  }

  const cacheKey = `${chainId}:${rpcUrl}`;
  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  clientCache.set(cacheKey, client);
  return client;
}

export async function getLatestChainTimestamp(chainId: number): Promise<number | null> {
  try {
    const client = getServerPublicClient(chainId);
    if (!client) {
      return null;
    }

    const block = await client.getBlock({ blockTag: "latest" });
    const timestamp = Number(block.timestamp);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch (error) {
    logServerError("academy/chain-time", error, {
      chainId,
    });
    return null;
  }
}
