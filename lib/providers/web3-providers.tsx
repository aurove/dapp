"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme } from "@rainbow-me/rainbowkit";
import { NotificationsToaster, TransactionFlowProvider } from "@fractals/tx-flow";
import { useMemo } from "react";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getRuntimeConfig } from "@/lib/config/env";
import { getWagmiConfig } from "@/lib/config/wagmi";

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const runtime = getRuntimeConfig();
  const environment = resolveAppEnvironment();
  const activeChain = getActiveChain(environment);
  const resolvedWagmiConfig = useMemo(() => getWagmiConfig(activeChain), [activeChain]);

  const explorerTxUrls = useMemo(
    () => ({
      [activeChain.id]: runtime.explorerBaseUrl || activeChain.blockExplorers?.default.url || null,
    }),
    [activeChain.id, activeChain.blockExplorers?.default.url, runtime.explorerBaseUrl],
  );
  const rainbowKitConfig = useMemo(
    () => ({
      initialChain: activeChain,
      theme: darkTheme({
        accentColor: "#5deda2",
        accentColorForeground: "#06110a",
        borderRadius: "medium",
        fontStack: "system",
        overlayBlur: "small",
      }),
    }),
    [activeChain],
  );

  return (
    <TransactionFlowProvider
      wagmiConfig={resolvedWagmiConfig}
      rainbowKit={rainbowKitConfig}
      explorerTxUrls={explorerTxUrls}
      defaultExplorerTxUrl={
        runtime.explorerBaseUrl || activeChain.blockExplorers?.default.url || null
      }
    >
      {children}
      <NotificationsToaster />
    </TransactionFlowProvider>
  );
}
