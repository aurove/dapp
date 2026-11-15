import type { Address, PublicClient } from "viem";
import {
  AERO_BASE_SEPOLIA_CHAIN_ID,
  getAerodromeMusdAddress,
  getAerodromePoolConfigs,
  getAerodromeRouterConfig,
  type AerodromePoolConfig,
} from "@/lib/bridge/aerodrome-pools";
import { SLIPSTREAM_POOL_ABI, SLIPSTREAM_SWAP_ROUTER_ABI } from "@/lib/bridge/slipstream-abis";
import type { SwapAsset, SwapPool, SwapRegistry } from "../domain";
import { getSwapRoutingConfig } from "./routing-config";

type ReadResult = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

function erc20Asset(params: {
  chainId: number;
  symbol: string;
  name: string;
  address: Address;
  decimals?: number;
}): SwapAsset {
  return {
    id: `erc20:${params.symbol}`,
    chainId: params.chainId,
    address: params.address,
    executableAddress: params.address,
    symbol: params.symbol,
    name: params.name,
    decimals: params.decimals ?? 18,
    form: "erc20",
    balanceDomain: "wallet",
    balanceKey: params.symbol,
  };
}

function buildBaseAssets(chainId: number, pools: AerodromePoolConfig[], musd: Address): SwapAsset[] {
  const bySymbol = new Map<string, SwapAsset>();
  bySymbol.set(
    "MUSD",
    erc20Asset({
      chainId,
      symbol: "MUSD",
      name: "Mezo USD",
      address: musd,
    }),
  );
  for (const pool of pools) {
    bySymbol.set(
      pool.shareSymbol,
      erc20Asset({
        chainId,
        symbol: pool.shareSymbol,
        name: pool.shareSymbol === "avMEZOv" ? "Aurove MEZO Vault (Base)" : "Aurove BTC Vault (Base)",
        address: pool.share,
      }),
    );
  }
  return [...bySymbol.values()];
}

/**
 * Horizon peer / MUSD markets on Base Sepolia Slipstream (no Mezo zap / ledger).
 */
export async function loadBaseSepoliaSwapRegistry(client: PublicClient): Promise<SwapRegistry> {
  const chainId = AERO_BASE_SEPOLIA_CHAIN_ID;
  const routers = getAerodromeRouterConfig();
  const musd = getAerodromeMusdAddress();
  const configured = getAerodromePoolConfigs().filter((pool) => pool.ready && pool.pool && pool.musd);

  if (!routers.swapRouter) {
    throw new Error("Base Sepolia Slipstream SwapRouter is not configured");
  }
  if (!musd) {
    throw new Error("Base Sepolia MUSD is not configured");
  }
  if (configured.length === 0) {
    throw new Error("No ready Base Sepolia Horizon CL pools are configured");
  }

  const poolAddresses = configured.map((pool) => pool.pool!);
  const results = (await client.multicall({
    allowFailure: true,
    contracts: poolAddresses.flatMap((address) => [
      { address, abi: SLIPSTREAM_POOL_ABI, functionName: "token0" },
      { address, abi: SLIPSTREAM_POOL_ABI, functionName: "token1" },
      { address, abi: SLIPSTREAM_POOL_ABI, functionName: "tickSpacing" },
      { address, abi: SLIPSTREAM_POOL_ABI, functionName: "fee" },
    ]),
  })) as ReadResult[];

  const pools: SwapPool[] = poolAddresses.flatMap((address, index) => {
    const values = results.slice(index * 4, index * 4 + 4);
    if (values.some((item) => item.status !== "success")) return [];
    const [token0, token1, tickSpacing, fee] = values.map((item) =>
      item.status === "success" ? item.result : null,
    );
    if (
      typeof token0 !== "string" ||
      typeof token1 !== "string" ||
      typeof tickSpacing !== "number" ||
      typeof fee !== "number"
    ) {
      return [];
    }
    const meta = configured[index]!;
    return [
      {
        key: meta.key,
        address,
        abi: SLIPSTREAM_POOL_ABI,
        token0: token0 as Address,
        token1: token1 as Address,
        tickSpacing,
        fee,
      },
    ];
  });

  if (pools.length === 0) {
    throw new Error("Base Sepolia Horizon pools could not be read on-chain");
  }

  const assets = buildBaseAssets(chainId, configured, musd);

  return {
    chainId,
    revision: `base-sepolia:${pools.map((pool) => `${pool.address}:${pool.tickSpacing}:${pool.fee}`).join("|")}`,
    clRouter: { address: routers.swapRouter, abi: SLIPSTREAM_SWAP_ROUTER_ABI },
    assets,
    pools,
    basicPools: [],
    // Single-hop only: peer↔MUSD pools exist; peer↔peer has no direct pool and is out of scope.
    routing: { ...getSwapRoutingConfig(), maxHops: 1 },
  };
}

/** Pure helper for unit tests — no RPC. */
export function buildBaseSepoliaSwapAssetsForTest(): SwapAsset[] {
  const musd = getAerodromeMusdAddress();
  if (!musd) return [];
  return buildBaseAssets(AERO_BASE_SEPOLIA_CHAIN_ID, getAerodromePoolConfigs(), musd);
}
