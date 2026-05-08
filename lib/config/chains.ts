import type { Chain } from "viem";
import { defineChain } from "viem";
import { hardhat } from "wagmi/chains";

export type AppEnvironment = "local" | "testnet" | "mainnet";

export function resolveAppEnvironment(): AppEnvironment {
  const env = (process.env.NEXT_PUBLIC_APP_ENV || "local").toLowerCase();
  if (env === "testnet" || env === "mainnet" || env === "local") {
    return env;
  }
  return "local";
}

export function getMezoTestnetRpcHttp(): string {
  return (
    process.env.NEXT_PUBLIC_SPECTRUM_MEZO_TESTNET_RPC_HTTP ||
    process.env.NEXT_PUBLIC_MEZO_TESTNET_RPC_HTTP ||
    "https://rpc.test.mezo.org"
  );
}

// Local chain definitions avoid importing mezo chain exports from @mezo-org/passport,
// which currently fail under our Turbopack build due to upstream export mismatch.
export const mezoTestnetChain: Chain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_MEZO_TESTNET_CHAIN_ID || 31611),
  name: "Mezo Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "BTC",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: [getMezoTestnetRpcHttp()],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Testnet Explorer",
      url: process.env.NEXT_PUBLIC_MEZO_TESTNET_EXPLORER || "https://explorer.test.mezo.org",
    },
  },
  testnet: true,
});

export const mezoMainnetChain: Chain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_MEZO_MAINNET_CHAIN_ID || 31612),
  name: "Mezo Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "BTC",
    symbol: "BTC",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MEZO_MAINNET_RPC_HTTP || "https://rpc.mezo.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Explorer",
      url: process.env.NEXT_PUBLIC_MEZO_MAINNET_EXPLORER || "https://explorer.mezo.org",
    },
  },
  testnet: false,
});

export function getActiveChain(environment = resolveAppEnvironment()): Chain {
  if (environment === "testnet") return mezoTestnetChain;
  if (environment === "mainnet") return mezoMainnetChain;
  return hardhat;
}

export const supportedChains = [hardhat, mezoTestnetChain, mezoMainnetChain] as const;
