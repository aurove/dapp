"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSwitchChain } from "wagmi";

import {
  getActiveChain,
  getAllowedAppChainIds,
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
  const pathname = usePathname();
  const { switchChainAsync } = useSwitchChain();
  const environment = resolveAppEnvironment();
  const expectedChain = getActiveChain(environment);
  const allowedChainIds = useMemo(
    () => getAllowedAppChainIds(pathname, environment),
    [pathname, environment],
  );

  function isAllowedChain(chainId: number | undefined, unsupported?: boolean) {
    if (unsupported) return false;
    if (chainId === undefined) return true;
    return allowedChainIds.includes(chainId);
  }

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
    allowedChainIds,
    isAllowedChain,
    switchToExpectedChain,
  };
}
