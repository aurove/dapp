import { getAddress, type Address } from "viem";

export type MusdConfig = {
  chainId: number;
  address: Address;
  symbol: "MUSD";
  decimals: 18;
};

const MUSD_TESTNET_ADDRESS = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
const MUSD_MAINNET_ADDRESS = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186" as const;

const MUSD_CONFIG_BY_CHAIN: Record<number, MusdConfig> = {
  31337: {
    chainId: 31337,
    address: getAddress(MUSD_MAINNET_ADDRESS),
    symbol: "MUSD",
    decimals: 18,
  },
  31611: {
    chainId: 31611,
    address: getAddress(MUSD_TESTNET_ADDRESS),
    symbol: "MUSD",
    decimals: 18,
  },
  31612: {
    chainId: 31612,
    address: getAddress(MUSD_MAINNET_ADDRESS),
    symbol: "MUSD",
    decimals: 18,
  },
};

export function getKnownMusdConfig(chainId: number): MusdConfig | null {
  return MUSD_CONFIG_BY_CHAIN[chainId] ?? null;
}
