"use client";

import type { Address } from "viem";
import type { TradeVeAssetType } from "../types";

type KnownVeTokenConfig = {
  assetType: TradeVeAssetType;
  address: Address;
};

type KnownPaymentTokenConfig = {
  address: Address;
  symbol: string;
  decimals: number;
};

// Sources:
// - packages/core/tigris/solidity/deployments/*/VeBTC.json
// - packages/core/test/asset-ledger.fork.ts (VE_MEZO_ADDRESS)
// - packages/marketplace/test/PaymentRouter.test.ts (BTC/MEZO)
// - packages/marketplace/scripts/deploy/utils.ts (DEFAULT_MUSD_MAINNET/TESTNET)
const KNOWN_VE_TOKENS_BY_CHAIN: Record<number, KnownVeTokenConfig[]> = {
  31611: [
    { assetType: "veBTC", address: "0xB63fcCd03521Cf21907627bd7fA465C129479231" },
    { assetType: "veMEZO", address: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b" },
  ],
  316: [
    { assetType: "veBTC", address: "0x7D807e9CE1ef73048FEe9A4214e75e894ea25914" },
    { assetType: "veMEZO", address: "0xb90fdAd3DFD180458D62Cc6acedc983D78E20122" },
  ],
  31337: [
    { assetType: "veBTC", address: "0xB63fcCd03521Cf21907627bd7fA465C129479231" },
    { assetType: "veMEZO", address: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b" },
  ],
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
  316: [
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

export function getKnownVeTokenConfigs(chainId: number): KnownVeTokenConfig[] {
  return KNOWN_VE_TOKENS_BY_CHAIN[chainId] ?? [];
}

export function getKnownPaymentTokenConfigs(chainId: number): KnownPaymentTokenConfig[] {
  return KNOWN_PAYMENT_TOKENS_BY_CHAIN[chainId] ?? [];
}
