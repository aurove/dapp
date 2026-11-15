import type { Address, PublicClient } from "viem";
import {
  AERO_BASE_SEPOLIA_CHAIN_ID,
  getAeroMusdAddress,
  getAeroPoolConfigs,
  getAeroRouterConfig,
  type AeroPoolConfig,
} from "@/lib/bridge/aero-pools";
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

function buildBaseAssets(chainId: number, pools: AeroPoolConfig[], musd: Address): SwapAsset[] {
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
  const routers = getAeroRouterConfig();
  const musd = getAeroMusdAddress();
  const configured = getAeroPoolConfigs().filter((pool) => pool.ready && pool.pool && pool.musd);

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
  const contracts = poolAddresses.flatMap((address) => [
    { address, abi: SLIPSTREAM_POOL_ABI, functionName: "token0" as const },
    { address, abi: SLIPSTREAM_POOL_ABI, functionName: "token1" as const },
    { address, abi: SLIPSTREAM_POOL_ABI, functionName: "tickSpacing" as const },
    { address, abi: SLIPSTREAM_POOL_ABI, functionName: "fee" as const },
  ]);

  let results: ReadResult[];
  try {
    results = (await client.multicall({
      allowFailure: true,
      contracts,
    })) as ReadResult[];
  } catch {
    // Chains without multicall3 (or RPC multicall outages) fall back to direct reads.
    results = [];
    for (const contract of contracts) {
      try {
        const result = await client.readContract(contract);
        results.push({ status: "success", result });
      } catch (error) {
        results.push({ status: "failure", error });
      }
    }
  }

  const pools: SwapPool[] = poolAddresses.flatMap((address, index) => {
    const values = results.slice(index * 4, index * 4 + 4);
    if (values.some((item) => item.status !== "success")) return [];
    const [token0, token1, tickSpacing, fee] = values.map((item) =>
      item.status === "success" ? item.result : null,
    );
    const spacing =
      typeof tickSpacing === "number"
        ? tickSpacing
        : typeof tickSpacing === "bigint"
          ? Number(tickSpacing)
          : null;
    const feeValue =
      typeof fee === "number" ? fee : typeof fee === "bigint" ? Number(fee) : null;
    if (
      typeof token0 !== "string" ||
      typeof token1 !== "string" ||
      spacing === null ||
      !Number.isFinite(spacing) ||
      feeValue === null ||
      !Number.isFinite(feeValue)
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
        tickSpacing: spacing,
        fee: feeValue,
      },
    ];
  });

  if (pools.length === 0) {
    throw new Error("Base Sepolia Horizon pools could not be read on-chain");
  }

  const assets = buildBaseAssets(chainId, configured, musd);
  const routing = getSwapRoutingConfig();

  return {
    chainId,
    revision: `base-sepolia:${pools.map((pool) => `${pool.address}:${pool.tickSpacing}:${pool.fee}`).join("|")}`,
    clRouter: { address: routers.swapRouter, abi: SLIPSTREAM_SWAP_ROUTER_ABI },
    assets,
    pools,
    basicPools: [],
    // Allow multi-hop so peer↔peer routes via MUSD (avMEZOv → MUSD → avBTCv).
    routing: { ...routing, maxHops: Math.max(routing.maxHops, 2) },
  };
}

/** Pure helper for unit tests — no RPC. */
export function buildBaseSepoliaSwapAssetsForTest(): SwapAsset[] {
  const musd = getAeroMusdAddress();
  if (!musd) return [];
  return buildBaseAssets(AERO_BASE_SEPOLIA_CHAIN_ID, getAeroPoolConfigs(), musd);
}
