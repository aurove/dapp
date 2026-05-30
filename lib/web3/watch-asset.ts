"use client";

import type { Address } from "viem";

type EthereumProvider = {
  request: (args: {
    method: string;
    params?: {
      type: "ERC20";
      options: {
        address: Address;
        symbol: string;
        decimals: number;
        image?: string;
      };
    };
  }) => Promise<unknown>;
};

type WatchTokenAssetParams = {
  address: Address;
  symbol: string;
  decimals?: number;
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
  image,
}: WatchTokenAssetParams): Promise<boolean> {
  const ethereum = getEthereumProvider();
  if (!ethereum?.request) {
    throw new Error("MetaMask or a compatible wallet extension was not found.");
  }

  const accepted = await ethereum.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address,
        symbol,
        decimals,
        image,
      },
    },
  });

  return Boolean(accepted);
}
