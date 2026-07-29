import { getMarketChainId } from "./config";

export const marketQueryKeys = {
  all: ["market"] as const,
  prices: (chainId = getMarketChainId()) => [...marketQueryKeys.all, "prices", chainId] as const,
  protocolStats: (chainId = getMarketChainId()) =>
    [...marketQueryKeys.all, "protocol-stats", chainId] as const,
};
