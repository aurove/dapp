"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  const [rpcSessionReady, setRpcSessionReady] = useState(environment !== "testnet");

  useEffect(() => {
    if (environment !== "testnet") {
      setRpcSessionReady(true);
      return;
    }

    let cancelled = false;

    async function ensureRpcSession() {
      try {
        await fetch("/api/rpc/session", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        });
      } finally {
        if (!cancelled) {
          setRpcSessionReady(true);
        }
      }
    }

    void ensureRpcSession();

    const interval = window.setInterval(() => {
      void ensureRpcSession();
    }, 9 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [environment]);

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

  if (!rpcSessionReady) {
    return null;
  }

  return <TxFlowRuntimeContext.Provider value={runtimeValue}>{tree}</TxFlowRuntimeContext.Provider>;
}
