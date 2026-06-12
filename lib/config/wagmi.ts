import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import type { Chain } from "viem";
import { createConfig, http, type Config } from "wagmi";
import { getRuntimeConfig } from "@/lib/config/env";

import { supportedChains } from "./chains";

let wagmiConfig: Config | undefined;
let wagmiConfigChainId: number | undefined;
let serverWagmiConfig: Config | undefined;
let serverWagmiConfigChainId: number | undefined;

function getChainRpcUrl(chain: Chain): string {
  return chain.rpcUrls.default.http[0] ?? "http://127.0.0.1:8545";
}

function getServerWagmiConfig(activeChain: Chain): Config {
  if (!serverWagmiConfig || serverWagmiConfigChainId !== activeChain.id) {
    serverWagmiConfig = createConfig({
      chains: supportedChains,
      transports: {
        ...Object.fromEntries(
          supportedChains.map((chain) => [chain.id, http(getChainRpcUrl(chain))]),
        ),
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
      appName: "Yield Bits",
      chains: supportedChains,
      projectId: runtime.walletConnectProjectId,
      transports: {
        ...Object.fromEntries(
          supportedChains.map((chain) => [chain.id, http(getChainRpcUrl(chain))]),
        ),
      },
      ssr: true,
    });
    wagmiConfigChainId = activeChain.id;
  }

  return wagmiConfig;
}
