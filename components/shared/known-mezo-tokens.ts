"use client";

import type { Address } from "viem";

export type KnownMezoTokenSymbol = "BTC" | "MEZO" | "MUSD";

export type KnownMezoTokenConfig = {
  address: Address;
  symbol: KnownMezoTokenSymbol;
  decimals: number;
};

export const KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN: Record<
  number,
  Record<KnownMezoTokenSymbol, Address>
> = {
  31611: {
    BTC: "0x7b7C000000000000000000000000000000000000",
    MEZO: "0x7B7c000000000000000000000000000000000001",
    MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  },
  31612: {
    BTC: "0x7b7C000000000000000000000000000000000000",
    MEZO: "0x7B7c000000000000000000000000000000000001",
    MUSD: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  },
  31337: {
    BTC: "0x7b7C000000000000000000000000000000000000",
    MEZO: "0x7B7c000000000000000000000000000000000001",
    MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  },
};

const KNOWN_MEZO_TOKENS_BY_CHAIN: Record<number, KnownMezoTokenConfig[]> = {
  31611: [
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31611].BTC, symbol: "BTC", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31611].MEZO, symbol: "MEZO", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31611].MUSD, symbol: "MUSD", decimals: 18 },
  ],
  31612: [
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31612].BTC, symbol: "BTC", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31612].MEZO, symbol: "MEZO", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31612].MUSD, symbol: "MUSD", decimals: 18 },
  ],
  31337: [
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31337].BTC, symbol: "BTC", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31337].MEZO, symbol: "MEZO", decimals: 18 },
    { address: KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[31337].MUSD, symbol: "MUSD", decimals: 18 },
  ],
};

export function getKnownMezoTokenConfigs(chainId: number): KnownMezoTokenConfig[] {
  return KNOWN_MEZO_TOKENS_BY_CHAIN[chainId] ?? [];
}

export function getKnownMezoTokenConfig(
  chainId: number,
  symbol: string,
): KnownMezoTokenConfig | null {
  const normalized = symbol.trim().toUpperCase() as KnownMezoTokenSymbol;
  if (normalized !== "BTC" && normalized !== "MEZO" && normalized !== "MUSD") {
    return null;
  }

  const address = KNOWN_MEZO_TOKEN_ADDRESSES_BY_CHAIN[chainId]?.[normalized];
  if (!address) {
    return null;
  }

  return {
    address,
    symbol: normalized,
    decimals: 18,
  };
}
