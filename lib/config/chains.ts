import type { Chain } from "viem";
import { defineChain } from "viem";
import { hardhat } from "wagmi/chains";

export type AppEnvironment = "local" | "testnet" | "mainnet";

export function resolveAppEnvironment(): AppEnvironment {
  const configuredEnvironment = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (!configuredEnvironment) {
    return process.env.NODE_ENV === "production" ? "testnet" : "local";
  }

  const env = configuredEnvironment;
  if (env === "testnet" || env === "mainnet" || env === "local") {
    return env;
  }

  throw new Error(
    `Invalid NEXT_PUBLIC_APP_ENV "${configuredEnvironment}". Expected local, testnet, or mainnet.`,
  );
}

export function getMezoTestnetRpcHttp(): string {
  return process.env.NEXT_PUBLIC_MEZO_TESTNET_RPC_HTTP || "https://rpc.test.mezo.org";
}

export function getMezoMainnetRpcHttp(): string {
  return process.env.NEXT_PUBLIC_MEZO_MAINNET_RPC_HTTP || "https://rpc-internal.mezo.org";
}

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function withMulticall(chain: Chain): Chain {
  return defineChain({
    ...chain,
    contracts: {
      ...chain.contracts,
      multicall3: {
        address: MULTICALL3_ADDRESS,
        blockCreated: 0,
      },
    },
  });
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
  contracts: {
    multicall3: {
      address: MULTICALL3_ADDRESS,
      blockCreated: 0,
    },
  },
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
      http: [getMezoMainnetRpcHttp()],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Explorer",
      url: process.env.NEXT_PUBLIC_MEZO_MAINNET_EXPLORER || "https://explorer.mezo.org",
    },
  },
  testnet: false,
  contracts: {
    multicall3: {
      address: MULTICALL3_ADDRESS,
      blockCreated: 0,
    },
  },
});

export function getActiveChain(environment = resolveAppEnvironment()): Chain {
  if (environment === "testnet") return mezoTestnetChain;
  if (environment === "mainnet") return mezoMainnetChain;
  return withMulticall(hardhat);
}

export const supportedChains = [
  withMulticall(hardhat),
  mezoTestnetChain,
  mezoMainnetChain,
] as const;
