"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Config, usePublicClient, useWriteContract, WagmiProvider } from "wagmi";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { Address } from "viem";

import type { TxContractsDeclaration, TxIconState, TxNotifyApi } from "./types";

export type TxFlowRuntimeContext = {
  account: Address;
  chainId: number;
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  writeAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  contracts: TxContractsDeclaration;
  notify?: TxNotifyApi;
};

type TxFlowProviderValue = {
  contracts: TxContractsDeclaration;
  notify?: TxNotifyApi;
  iconState: TxIconState;
  setIconState: (state: TxIconState) => void;
};

const TxFlowProviderContext = createContext<TxFlowProviderValue | null>(null);

export type TransactionFlowProviderProps = {
  children: React.ReactNode;
  wagmiConfig: Config;
  queryClient?: QueryClient;
  createQueryClient?: () => QueryClient;
  rainbowKit?: false | Omit<React.ComponentProps<typeof RainbowKitProvider>, "children">;
  contracts: TxFlowProviderValue["contracts"];
  notify?: TxFlowProviderValue["notify"];
};

export function TransactionFlowProvider({
  contracts,
  notify,
  children,
  queryClient,
  createQueryClient,
  rainbowKit,
  wagmiConfig,
}: TransactionFlowProviderProps) {
  const [iconState, setIconState] = useState<TxIconState>("idle");

  const [fallbackQueryClient] = useState(() => createQueryClient?.() ?? new QueryClient());
  const resolvedQueryClient = queryClient ?? fallbackQueryClient;

  const runtimeConfig = useMemo(
    () => ({
      contracts,
      notify,
      iconState,
      setIconState,
    }),
    [contracts, notify, iconState],
  );

  const rainbowProps = rainbowKit === false ? null : (rainbowKit ?? {});

  const tree = (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={resolvedQueryClient}>
        {rainbowProps ? (
          <RainbowKitProvider {...rainbowProps}>{children}</RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );

  return (
    <TxFlowProviderContext.Provider value={runtimeConfig}>{tree}</TxFlowProviderContext.Provider>
  );
}

export function useTxFlowProvider() {
  const ctx = useContext(TxFlowProviderContext);
  if (!ctx) {
    throw new Error(
      "TransactionFlowProvider is missing. Wrap the app in <TransactionFlowProvider />.",
    );
  }

  return ctx;
}

export function useTxFlowIconState() {
  return useTxFlowProvider().iconState;
}
