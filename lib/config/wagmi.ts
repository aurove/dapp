import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  baseAccount,
  bitgetWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import type { Chain } from "viem";
import { createConfig, http, type Config } from "wagmi";
import { getRuntimeConfig } from "@/lib/config/env";

let wagmiConfig: Config | undefined;
let wagmiConfigChainId: number | undefined;
let serverWagmiConfig: Config | undefined;
let serverWagmiConfigChainId: number | undefined;

const walletList = [
  {
    groupName: "Recommended",
    wallets: [injectedWallet, bitgetWallet, walletConnectWallet],
  },
  {
    groupName: "Popular",
    wallets: [safeWallet, rainbowWallet, baseAccount, metaMaskWallet],
  },
] satisfies Parameters<typeof getDefaultConfig>[0]["wallets"];

function getChainRpcUrl(chain: Chain): string {
  const rpcUrl = chain.rpcUrls.default.http[0]?.trim();
  if (!rpcUrl) {
    throw new Error(`No RPC URL is configured for chain ${chain.id}.`);
  }
  return rpcUrl;
}

function getServerWagmiConfig(activeChain: Chain): Config {
  if (!serverWagmiConfig || serverWagmiConfigChainId !== activeChain.id) {
    serverWagmiConfig = createConfig({
      chains: [activeChain],
      multiInjectedProviderDiscovery: false,
      transports: {
        [activeChain.id]: http(getChainRpcUrl(activeChain)),
      },
      ssr: true,
    });
    serverWagmiConfigChainId = activeChain.id;
  }

  return serverWagmiConfig;
}

export function getWagmiConfig(activeChain: Chain): Config {
  const runtime = getRuntimeConfig();

  if (typeof window === "undefined") {
    return getServerWagmiConfig(activeChain);
  }

  if (!wagmiConfig || wagmiConfigChainId !== activeChain.id) {
    wagmiConfig = getDefaultConfig({
      appName: "Aurove",
      chains: [activeChain],
      multiInjectedProviderDiscovery: false,
      wallets: walletList,
      projectId: runtime.walletConnectProjectId,
      transports: {
        [activeChain.id]: http(getChainRpcUrl(activeChain)),
      },
      ssr: true,
    });
    wagmiConfigChainId = activeChain.id;
  }

  return wagmiConfig;
}
