"use client";

import { useSwitchChain } from "wagmi";

import {
  getActiveChain,
  getMezoTestnetRpcHttp,
  mezoTestnetChain,
  resolveAppEnvironment,
} from "@/lib/config/chains";

function getWalletRpcUrl(expectedChain: ReturnType<typeof getActiveChain>): string | undefined {
  if (expectedChain.id === mezoTestnetChain.id) {
    const browserRpcUrl = getMezoTestnetRpcHttp();
    if (typeof window !== "undefined") {
      try {
        return new URL(browserRpcUrl, window.location.origin).toString();
      } catch {
        return browserRpcUrl;
      }
    }
    return browserRpcUrl;
  }

  return expectedChain.rpcUrls.default.http[0];
}

export function useAppChainSwitch() {
  const { switchChainAsync } = useSwitchChain();
  const expectedChain = getActiveChain(resolveAppEnvironment());

  async function switchToExpectedChain(onFailure?: () => void) {
    try {
      await switchChainAsync({
        chainId: expectedChain.id,
        addEthereumChainParameter: (() => {
          const rpcUrl = getWalletRpcUrl(expectedChain);
          return rpcUrl ? { rpcUrls: [rpcUrl] } : undefined;
        })(),
      });
      return true;
    } catch {
      onFailure?.();
      return false;
    }
  }

  return {
    expectedChain,
    switchToExpectedChain,
  };
}
