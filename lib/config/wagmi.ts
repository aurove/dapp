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
import { rainbowkitBurnerWallet } from "burner-connector";
import type { Chain } from "viem";
import { createConfig, http, type Config } from "wagmi";
import { getRuntimeConfig } from "@/lib/config/env";
import { shouldShowBurnerWallet } from "@/lib/config/scaffold";
import { ensureDeterministicBurnerPrivateKey } from "@/lib/web3/burner-wallet";

let wagmiConfig: Config | undefined;
let wagmiConfigChainId: number | undefined;
let serverWagmiConfig: Config | undefined;
let serverWagmiConfigChainId: number | undefined;

type WalletList = NonNullable<Parameters<typeof getDefaultConfig>[0]["wallets"]>;

function buildWalletList(activeChain: Chain): WalletList {
  const recommended = [injectedWallet, bitgetWallet, walletConnectWallet];
  const popular = [safeWallet, rainbowWallet, baseAccount, metaMaskWallet];

  if (shouldShowBurnerWallet(activeChain.id)) {
    // Optional: new burner key per tab (default persists across tabs via localStorage)
    // rainbowkitBurnerWallet.useSessionStorage = true;

    // Prefer chain RPC from app config when the connector builds its wallet client.
    const rpcUrl = activeChain.rpcUrls.default.http[0]?.trim();
    if (rpcUrl) {
      rainbowkitBurnerWallet.rpcUrls = {
        ...(rainbowkitBurnerWallet.rpcUrls ?? {}),
        [activeChain.id]: rpcUrl,
      };
    }

    // Local/dev group so burner is easy to find without replacing MetaMask.
    return [
      {
        groupName: "Development",
        wallets: [rainbowkitBurnerWallet],
      },
      {
        groupName: "Recommended",
        wallets: recommended,
      },
      {
        groupName: "Popular",
        wallets: popular,
      },
    ];
  }

  return [
    {
      groupName: "Recommended",
      wallets: recommended,
    },
    {
      groupName: "Popular",
      wallets: popular,
    },
  ];
}

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

  // Seed deterministic PK for E2E before the connector loads storage.
  ensureDeterministicBurnerPrivateKey();

  if (!wagmiConfig || wagmiConfigChainId !== activeChain.id) {
    wagmiConfig = getDefaultConfig({
      appName: "Aurove",
      chains: [activeChain],
      multiInjectedProviderDiscovery: false,
      wallets: buildWalletList(activeChain),
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
