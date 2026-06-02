"use client";

import type { Address } from "viem";

type WatchAssetRequest =
  | {
      type: "ERC20";
      options: {
        address: Address;
        symbol: string;
        decimals: number;
        image?: string;
      };
    }
  | {
      type: "ERC1155";
      options: {
        address: Address;
        tokenId: string;
        image?: string;
      };
    };

type EthereumProvider = {
  request: (args: { method: string; params?: WatchAssetRequest }) => Promise<unknown>;
};

type WatchTokenAssetParams = {
  address: Address;
  symbol: string;
  decimals?: number;
  tokenId?: bigint;
  image?: string;
};

function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum ?? null;
}

export async function watchTokenAsset({
  address,
  symbol,
  decimals = 18,
  tokenId,
  image,
}: WatchTokenAssetParams): Promise<boolean> {
  const ethereum = getEthereumProvider();
  if (!ethereum?.request) {
    throw new Error("MetaMask or a compatible wallet extension was not found.");
  }

  const params: WatchAssetRequest =
    tokenId !== undefined
      ? {
          type: "ERC1155",
          options: {
            address,
            tokenId: tokenId.toString(),
          },
        }
      : {
          type: "ERC20",
          options: {
            address,
            symbol,
            decimals,
            image,
          },
        };

  const accepted = await ethereum.request({
    method: "wallet_watchAsset",
    params,
  });

  return Boolean(accepted);
}
