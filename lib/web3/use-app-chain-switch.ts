"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import type { Chain } from "viem";
import { useSwitchChain } from "wagmi";

import {
  baseSepoliaChain,
  getActiveChain,
  getAllowedAppChainIds,
  getMezoTestnetRpcHttp,
  getSwitchableAppChains,
  mezoTestnetChain,
  resolveAppEnvironment,
} from "@/lib/config/chains";

function getWalletRpcUrl(chain: Chain): string | undefined {
  if (chain.id === mezoTestnetChain.id) {
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

  return chain.rpcUrls.default.http[0];
}

function findSwitchableChain(chains: readonly Chain[], chainId: number): Chain | undefined {
  return chains.find((chain) => chain.id === chainId);
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
  const switchableChains = useMemo(
    () => getSwitchableAppChains(environment),
    [environment],
  );

  function isAllowedChain(chainId: number | undefined, unsupported?: boolean) {
    if (unsupported) return false;
    if (chainId === undefined) return true;
    return allowedChainIds.includes(chainId);
  }

  async function switchToChain(chainId: number, onFailure?: () => void) {
    const target = findSwitchableChain(switchableChains, chainId);
    if (!target) {
      onFailure?.();
      return false;
    }
    try {
      await switchChainAsync({
        chainId: target.id,
        addEthereumChainParameter: (() => {
          const rpcUrl = getWalletRpcUrl(target);
          return rpcUrl
            ? {
                chainName: target.name,
                nativeCurrency: target.nativeCurrency,
                rpcUrls: [rpcUrl],
                blockExplorerUrls: target.blockExplorers?.default?.url
                  ? [target.blockExplorers.default.url]
                  : undefined,
              }
            : undefined;
        })(),
      });
      return true;
    } catch {
      onFailure?.();
      return false;
    }
  }

  async function switchToExpectedChain(onFailure?: () => void) {
    return switchToChain(expectedChain.id, onFailure);
  }

  async function switchToMezo(onFailure?: () => void) {
    return switchToChain(mezoTestnetChain.id, onFailure);
  }

  async function switchToBaseSepolia(onFailure?: () => void) {
    return switchToChain(baseSepoliaChain.id, onFailure);
  }

  return {
    expectedChain,
    allowedChainIds,
    switchableChains,
    isAllowedChain,
    switchToChain,
    switchToExpectedChain,
    switchToMezo,
    switchToBaseSepolia,
  };
}
