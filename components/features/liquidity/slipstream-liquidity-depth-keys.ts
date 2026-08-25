import type { Address } from "viem";

export const SLIPSTREAM_DEPTH_QUERY_ROOT = "slipstream-liquidity-depth";

export const slipstreamLiquidityDepthKeys = {
  all: [SLIPSTREAM_DEPTH_QUERY_ROOT] as const,
  chain: (chainId: number) => [SLIPSTREAM_DEPTH_QUERY_ROOT, chainId] as const,
  pool: (chainId: number, address: Address) =>
    [SLIPSTREAM_DEPTH_QUERY_ROOT, chainId, address.toLowerCase()] as const,
};
