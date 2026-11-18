import type { Address } from "viem";
import type { Chain } from "@wormhole-foundation/sdk";
import type { Ntt } from "@wormhole-foundation/sdk-definitions-ntt";

export type HorizonBridgeAsset = "avBTCv" | "avMEZOv";

export type HorizonWormholeChain = Extract<Chain, "Mezo" | "BaseSepolia">;

export type HorizonChainConfig = {
  name: string;
  wormholeChain: HorizonWormholeChain;
  wormholeChainId: number;
  nativeChainId: 31611 | 84532;
  side: "hub" | "spoke";
  rpc: string;
  assets: Record<HorizonBridgeAsset, Ntt.Contracts>;
};

/** Mezo Testnet ↔ Base Sepolia NTT deployments for Horizon vault shares (Wave 2). */
export const HORIZON_TESTNET = {
  31611: {
    name: "Mezo Testnet",
    wormholeChain: "Mezo",
    wormholeChainId: 50,
    nativeChainId: 31611,
    side: "hub",
    rpc: process.env.NEXT_PUBLIC_MEZO_TESTNET_RPC_HTTP || "https://rpc.test.mezo.org",
    assets: {
      avBTCv: {
        token: "0x8e95C83A5144dcdD6ce79D7fBd58057b689f086f",
        manager: "0x01B2C64505f367203429753029EA8BEB66987a09",
        transceiver: {
          wormhole: "0xA21328Abc178E1b47eC9A14f40e7100372678d10",
        },
      },
      avMEZOv: {
        token: "0x2C45a18a23d5bfFf3Fc0c4Bff6376dA1d943373c",
        manager: "0x2a0B2726f7822cEBdE9D665D049a42f13Fa6A517",
        transceiver: {
          wormhole: "0x6201F4c88aAfDd627108467dafA81464E3eb885a",
        },
      },
    },
  },
  84532: {
    name: "Base Sepolia",
    wormholeChain: "BaseSepolia",
    wormholeChainId: 10004,
    nativeChainId: 84532,
    side: "spoke",
    rpc: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_HTTP || "https://sepolia.base.org",
    assets: {
      avBTCv: {
        token: "0x0d36e2B7350950662859A82A91E13Ad7d0E594E0",
        manager: "0x96e12AD5F0402a458823A8E2A6Ea0E986DCD358e",
        transceiver: {
          wormhole: "0x82C8d99f67eB28b023387236051cB292c9A477AA",
        },
      },
      avMEZOv: {
        token: "0x172096f3F0F98B9dc1302695A48044D6A3D799C9",
        manager: "0x79D11c9d7F5d5ef676c4c87Cf9deEC5D972bd8A1",
        transceiver: {
          wormhole: "0x9383b1ACAf2bD2B0F6b205Be9fFbCcBfC78A8300",
        },
      },
    },
  },
} as const satisfies Record<31611 | 84532, HorizonChainConfig>;

/**
 * Pre–Wave 2 Base Sepolia peer tokens (2026-11-10 redeploy). Deposit / swap / NTT
 * use `HORIZON_TESTNET` only; these addresses are for stranded-balance detection.
 */
export const HORIZON_LEGACY_BASE_PEERS = {
  avBTCv: "0xb25912d67A8fb9C7Acb8b2eB4c1600aF7872D132",
  avMEZOv: "0x2E9eAa58834c39a8bDe92886Cbf8A18954bFF855",
} as const satisfies Record<HorizonBridgeAsset, Address>;

export type HorizonNativeChainId = keyof typeof HORIZON_TESTNET;

export function getHorizonChain(chainId: number): HorizonChainConfig | null {
  if (chainId === 31611 || chainId === 84532) {
    return HORIZON_TESTNET[chainId];
  }
  return null;
}

export function getHorizonPeerChain(chainId: number): HorizonChainConfig {
  return chainId === 84532 ? HORIZON_TESTNET[31611] : HORIZON_TESTNET[84532];
}

export function getHorizonNttContracts(
  chainId: HorizonNativeChainId,
  asset: HorizonBridgeAsset,
): Ntt.Contracts {
  return HORIZON_TESTNET[chainId].assets[asset];
}

export function getHorizonTransceiverAddress(
  chainId: HorizonNativeChainId,
  asset: HorizonBridgeAsset,
): Address {
  return HORIZON_TESTNET[chainId].assets[asset].transceiver!.wormhole as Address;
}
