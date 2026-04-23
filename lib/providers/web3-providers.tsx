"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme } from "@rainbow-me/rainbowkit";
import { useMemo } from "react";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getWagmiConfig } from "@/lib/config/wagmi";
import contracts from "@/contracts/registry";
import { TransactionFlowProvider } from "@/lib/tx-flow";

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const environment = resolveAppEnvironment();
  const activeChain = getActiveChain(environment);
  const resolvedWagmiConfig = useMemo(() => getWagmiConfig(activeChain), [activeChain]);
  const rainbowKitConfig = useMemo(
    () => ({
      initialChain: activeChain,
      theme: darkTheme({
        accentColor: "#a78858",
        accentColorForeground: "#fefaf0",
        borderRadius: "medium",
        overlayBlur: "small",
      }),
    }),
    [activeChain],
  );

  return (
    <TransactionFlowProvider
      contracts={contracts}
      wagmiConfig={resolvedWagmiConfig}
      rainbowKit={rainbowKitConfig}
    >
      {children}
    </TransactionFlowProvider>
  );
}
