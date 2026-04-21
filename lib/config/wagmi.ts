import { createTxFlowWagmiConfig } from "@fractals/tx-flow";
import type { Chain } from "viem";
import { createConfig, http, type Config } from "wagmi";
import { getRuntimeConfig } from "@/lib/config/env";

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
      chains: [activeChain],
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
    wagmiConfig = createTxFlowWagmiConfig({
      appName: "Fractals Marketplace",
      walletConnectProjectId: runtime.walletConnectProjectId,
      chains: [activeChain],
      ssr: true,
    });
    wagmiConfigChainId = activeChain.id;
  }

  return wagmiConfig;
}
