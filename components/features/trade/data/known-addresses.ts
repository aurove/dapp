"use client";

import type { Address } from "viem";

type KnownPaymentTokenConfig = {
  address: Address;
  symbol: string;
  decimals: number;
};

const BTC_ADDRESS: Address = "0x7b7C000000000000000000000000000000000000";
const MEZO_ADDRESS: Address = "0x7B7c000000000000000000000000000000000001";
const MUSD_TESTNET: Address = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const MUSD_MAINNET: Address = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186";

const KNOWN_PAYMENT_TOKENS_BY_CHAIN: Record<number, KnownPaymentTokenConfig[]> = {
  31611: [
    { address: BTC_ADDRESS, symbol: "BTC", decimals: 18 },
    { address: MEZO_ADDRESS, symbol: "MEZO", decimals: 18 },
    { address: MUSD_TESTNET, symbol: "MUSD", decimals: 18 },
  ],
  31612: [
    { address: BTC_ADDRESS, symbol: "BTC", decimals: 18 },
    { address: MEZO_ADDRESS, symbol: "MEZO", decimals: 18 },
    { address: MUSD_MAINNET, symbol: "MUSD", decimals: 18 },
  ],
  31337: [
    { address: BTC_ADDRESS, symbol: "BTC", decimals: 18 },
    { address: MEZO_ADDRESS, symbol: "MEZO", decimals: 18 },
    { address: MUSD_TESTNET, symbol: "MUSD", decimals: 18 },
  ],
};

export function getKnownPaymentTokenConfigs(chainId: number): KnownPaymentTokenConfig[] {
  return KNOWN_PAYMENT_TOKENS_BY_CHAIN[chainId] ?? [];
}
