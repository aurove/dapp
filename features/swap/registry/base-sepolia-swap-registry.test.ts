import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AERO_BASE_SEPOLIA_CHAIN_ID,
  getAerodromeMusdAddress,
  getAerodromePoolConfigs,
  getAerodromeRouterConfig,
} from "@/lib/bridge/aerodrome-pools";
import { canSwapRoute } from "../routing";
import type { SwapPool, SwapRegistry } from "../domain";
import { SLIPSTREAM_POOL_ABI, SLIPSTREAM_SWAP_ROUTER_ABI } from "@/lib/bridge/slipstream-abis";
import { buildBaseSepoliaSwapAssetsForTest } from "./base-sepolia-swap-registry";
import { getSwapRoutingConfig } from "./routing-config";

describe("base sepolia swap registry helpers", () => {
  it("exposes Wave 2 peer/MUSD assets and ready pools", () => {
    const assets = buildBaseSepoliaSwapAssetsForTest();
    const symbols = assets.map((asset) => asset.symbol).sort();
    assert.deepEqual(symbols, ["MUSD", "avBTCv", "avMEZOv"]);
    const pools = getAerodromePoolConfigs();
    assert.equal(pools.every((pool) => pool.ready), true);
    assert.ok(getAerodromeMusdAddress());
    assert.ok(getAerodromeRouterConfig().swapRouter);
  });

  it("routes peer↔MUSD and peer↔peer via MUSD", () => {
    const assets = buildBaseSepoliaSwapAssetsForTest();
    const musd = assets.find((asset) => asset.symbol === "MUSD")!;
    const avmezov = assets.find((asset) => asset.symbol === "avMEZOv")!;
    const avbtcv = assets.find((asset) => asset.symbol === "avBTCv")!;
    const configured = getAerodromePoolConfigs();
    const pools: SwapPool[] = configured.map((pool) => ({
      key: pool.key,
      address: pool.pool!,
      abi: SLIPSTREAM_POOL_ABI,
      token0: pool.share.toLowerCase() < pool.musd!.toLowerCase() ? pool.share : pool.musd!,
      token1: pool.share.toLowerCase() < pool.musd!.toLowerCase() ? pool.musd! : pool.share,
      tickSpacing: pool.tickSpacing,
      fee: 3000,
    }));
    const routing = { ...getSwapRoutingConfig(), maxHops: Math.max(getSwapRoutingConfig().maxHops, 2) };
    const registry: SwapRegistry = {
      chainId: AERO_BASE_SEPOLIA_CHAIN_ID,
      revision: "test",
      clRouter: {
        address: getAerodromeRouterConfig().swapRouter!,
        abi: SLIPSTREAM_SWAP_ROUTER_ABI,
      },
      assets,
      pools,
      routing,
    };

    assert.equal(canSwapRoute(registry, avmezov.address, musd.address), true);
    assert.equal(canSwapRoute(registry, musd.address, avbtcv.address), true);
    assert.equal(canSwapRoute(registry, avmezov.address, avbtcv.address), true);
    assert.equal(canSwapRoute(registry, avbtcv.address, avmezov.address), true);
  });
});
