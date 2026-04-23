"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { createContext, useContext, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Config, WagmiProvider } from "wagmi";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { getWagmiConfig } from "@/lib/config/wagmi";
import contracts from "@/contracts/registry";
import type { TxContractsDeclaration, TxIconState, TxNotifyApi } from "@/lib/tx-flow/types";

type TxFlowRuntimeValue = {
  contracts: TxContractsDeclaration;
  notify?: TxNotifyApi;
  iconState: TxIconState;
  setIconState: (state: TxIconState) => void;
};

const TxFlowRuntimeContext = createContext<TxFlowRuntimeValue | null>(null);

export function useTxFlowRuntime() {
  const ctx = useContext(TxFlowRuntimeContext);
  if (!ctx) {
    throw new Error("TxFlow runtime is missing. Wrap the app in <Web3Providers />.");
  }

  return ctx;
}

type Web3ProvidersProps = {
  children: React.ReactNode;
  queryClient?: QueryClient;
  createQueryClient?: () => QueryClient;
  wagmiConfig?: Config;
  rainbowKit?: false | Omit<React.ComponentProps<typeof RainbowKitProvider>, "children">;
  notify?: TxNotifyApi;
};

export function Web3Providers({
  children,
  queryClient,
  createQueryClient,
  wagmiConfig,
  rainbowKit,
  notify,
}: Web3ProvidersProps) {
  const environment = resolveAppEnvironment();
  const activeChain = getActiveChain(environment);
  const resolvedWagmiConfig = useMemo(
    () => wagmiConfig ?? getWagmiConfig(activeChain),
    [activeChain, wagmiConfig],
  );
  const rainbowKitConfig = useMemo(
    () =>
      rainbowKit === false
        ? false
        : (rainbowKit ?? {
            initialChain: activeChain,
            theme: darkTheme({
              accentColor: "#a78858",
              accentColorForeground: "#fefaf0",
              borderRadius: "medium",
              overlayBlur: "small",
            }),
          }),
    [activeChain, rainbowKit],
  );

  const [iconState, setIconState] = useState<TxIconState>("idle");
  const [fallbackQueryClient] = useState(() => createQueryClient?.() ?? new QueryClient());
  const resolvedQueryClient = queryClient ?? fallbackQueryClient;

  const runtimeValue = useMemo<TxFlowRuntimeValue>(
    () => ({
      contracts,
      notify,
      iconState,
      setIconState,
    }),
    [iconState, notify],
  );

  const tree = (
    <WagmiProvider config={resolvedWagmiConfig}>
      <QueryClientProvider client={resolvedQueryClient}>
        {rainbowKitConfig ? (
          <RainbowKitProvider {...rainbowKitConfig}>{children}</RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );

  return <TxFlowRuntimeContext.Provider value={runtimeValue}>{tree}</TxFlowRuntimeContext.Provider>;
}
