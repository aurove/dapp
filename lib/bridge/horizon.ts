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

/** Mezo Testnet ↔ Base Sepolia NTT deployments for Horizon vault shares. */
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
        token: "0xb4122E019693A7A7c470519093599D0c45f7CF12",
        manager: "0x7F47719ca9B033843e575fA49F847220337De151",
        transceiver: {
          wormhole: "0xE17A087AbCf0a45072d110078E1937911d4829E7",
        },
      },
      avMEZOv: {
        token: "0xe65dA484Ec0820b4E9c8be731D38E27368b4aAC6",
        manager: "0x0F909054b03dBfAd5212c2209051F37CD3e582c9",
        transceiver: {
          wormhole: "0xF1E1Fa9dBa06D8Ce388d48492bf45616d7eF61fB",
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
        token: "0xb25912d67A8Fb9C7Acb8b2eB4c1600aF7872D132",
        manager: "0x862f45A57f83393AC5a01c5860DF2A5e051501C4",
        transceiver: {
          wormhole: "0xf22EaAecdA0E2144154a964C2294549a3Ba999C4",
        },
      },
      avMEZOv: {
        token: "0x2E9eAa58834c39a8bDe92886Cbf8A18954bFF855",
        manager: "0xe97416e5Cac85493Eee13ecc165275Dcb8A5bDed",
        transceiver: {
          wormhole: "0xA64616831f8B430469E9101F35Ba778a485d3848",
        },
      },
    },
  },
} as const satisfies Record<31611 | 84532, HorizonChainConfig>;

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
