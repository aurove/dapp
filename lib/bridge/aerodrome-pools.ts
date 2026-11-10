import { getAddress, isAddress, type Address } from "viem";
import { HORIZON_TESTNET, type HorizonBridgeAsset } from "@/lib/bridge/horizon";

/** Base Sepolia Slipstream demos for Horizon vault-share / MUSD pools. */
export const AERO_BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const AERO_TICK_SPACING = 200 as const;

/** Canonical MUSD on Base / Ethereum / Mezo mainnet (NTT). Not deployed on Base Sepolia. */
export const CANONICAL_MUSD_MAINNET = getAddress(
  "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
);

export type AerodromePoolKey = "avMEZOv-MUSD" | "avBTCv-MUSD";

export type AerodromePoolConfig = {
  key: AerodromePoolKey;
  asset: HorizonBridgeAsset;
  shareSymbol: "avMEZOv" | "avBTCv";
  share: Address;
  /** DemoMUSD or Sepolia MUSD when set; null until deploy. */
  musd: Address | null;
  /** CL200 pool address; null until create-horizon-pools broadcast. */
  pool: Address | null;
  tickSpacing: number;
  ready: boolean;
};

export type AerodromeRouterConfig = {
  swapRouter: Address | null;
  positionManager: Address | null;
};

const DOCS = {
  horizonAero: "https://github.com/Aurove/horizon/blob/main/aero/README.md",
  aerodrome: "https://aerodrome.finance/",
  poolsRunbook: "https://github.com/Aurove/horizon/blob/main/aero/README.md#create--seed-horizon-sharemusd-pools",
} as const;

function readOptionalAddress(value: string | undefined | null): Address | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

/**
 * Hardcoded Base Sepolia peer tokens (match `HORIZON_TESTNET` / horizon-aero deployments).
 * Pool addresses stay null until Slipstream + DemoMUSD + create-horizon-pools are broadcast;
 * override via NEXT_PUBLIC_AERO_* env when known.
 */
const PEER_SHARES = {
  avMEZOv: getAddress(HORIZON_TESTNET[84532].assets.avMEZOv.token),
  avBTCv: getAddress(HORIZON_TESTNET[84532].assets.avBTCv.token),
} as const;

/** Optional env overrides after `horizon/aero` broadcast writes pools.json. */
function poolAddressFromEnv(key: AerodromePoolKey): Address | null {
  if (key === "avMEZOv-MUSD") {
    return readOptionalAddress(process.env.NEXT_PUBLIC_AERO_AVMEZOV_MUSD_POOL);
  }
  return readOptionalAddress(process.env.NEXT_PUBLIC_AERO_AVBTCV_MUSD_POOL);
}

export function getAerodromeMusdAddress(): Address | null {
  return (
    readOptionalAddress(process.env.NEXT_PUBLIC_AERO_MUSD_ADDRESS) ??
    readOptionalAddress(process.env.NEXT_PUBLIC_AERO_DEMO_MUSD_ADDRESS)
  );
}

export function getAerodromeRouterConfig(): AerodromeRouterConfig {
  return {
    swapRouter: readOptionalAddress(process.env.NEXT_PUBLIC_AERO_SWAP_ROUTER),
    positionManager: readOptionalAddress(process.env.NEXT_PUBLIC_AERO_POSITION_MANAGER),
  };
}

export function getAerodromePoolConfigs(): AerodromePoolConfig[] {
  const musd = getAerodromeMusdAddress();

  const rows: Array<Omit<AerodromePoolConfig, "ready">> = [
    {
      key: "avMEZOv-MUSD",
      asset: "avMEZOv",
      shareSymbol: "avMEZOv",
      share: PEER_SHARES.avMEZOv,
      musd,
      // Placeholder until broadcast — env wins when set.
      pool: poolAddressFromEnv("avMEZOv-MUSD"),
      tickSpacing: AERO_TICK_SPACING,
    },
    {
      key: "avBTCv-MUSD",
      asset: "avBTCv",
      shareSymbol: "avBTCv",
      share: PEER_SHARES.avBTCv,
      musd,
      pool: poolAddressFromEnv("avBTCv-MUSD"),
      tickSpacing: AERO_TICK_SPACING,
    },
  ];

  return rows.map((row) => ({
    ...row,
    ready: Boolean(row.pool && row.musd),
  }));
}

export function getAerodromePoolForAsset(asset: HorizonBridgeAsset): AerodromePoolConfig {
  const pools = getAerodromePoolConfigs();
  return pools.find((pool) => pool.asset === asset) ?? pools[0]!;
}

export function areAerodromePoolsReady(pools = getAerodromePoolConfigs()): boolean {
  return pools.length > 0 && pools.every((pool) => pool.ready);
}

export function getAerodromeDocs() {
  return DOCS;
}

export function getBaseSepoliaAddressUrl(address: Address): string {
  return `https://sepolia.basescan.org/address/${address}`;
}

export function shortAerodromeAddress(value: Address): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
