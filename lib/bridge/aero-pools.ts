import { getAddress, isAddress, type Address } from "viem";
import { HORIZON_TESTNET, type HorizonBridgeAsset } from "@/lib/bridge/horizon";

/** Base Sepolia Slipstream demos for Horizon vault-share / MUSD pools. */
export const AERO_BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const AERO_TICK_SPACING = 200 as const;

/** Canonical MUSD on Base / Ethereum / Mezo mainnet (NTT). Not deployed on Base Sepolia. */
export const CANONICAL_MUSD_MAINNET = getAddress(
  "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
);

/**
 * Base Sepolia MUSD (Mezo testnet NTT spoke). Hub Mezo testnet MUSD is
 * `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` — do not use that address on Base.
 */
export const BASE_SEPOLIA_MUSD = getAddress("0x560985f804De8187E8FBA94F7127Bc4c0e54AEA5");

/** Live minimal Slipstream stack on Base Sepolia (2026-11-10 redeploy). */
export const AERO_BASE_SEPOLIA_DEFAULTS = {
  swapRouter: getAddress("0xE056f7fF35B952E7BE7D78b8F68c0F293fB6E6Ba"),
  positionManager: getAddress("0xB0D6450Ed37Da105B7ea3cd29D1256616DaA9B5F"),
  pools: {
    "avMEZOv-MUSD": getAddress("0xD084DB8cBbE7865d4dAcaF35e4a4A6a436D0EEe8"),
    "avBTCv-MUSD": getAddress("0x95D890750550791E44a1d1f4986443d51696BdA5"),
  },
} as const;

export type AeroPoolKey = "avMEZOv-MUSD" | "avBTCv-MUSD";

export type AeroPoolConfig = {
  key: AeroPoolKey;
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

export type AeroRouterConfig = {
  swapRouter: Address | null;
  positionManager: Address | null;
};

const DOCS = {
  horizonAero: "https://github.com/Aurove/horizon/blob/main/aero/README.md",
  aero: "https://aerodrome.finance/",
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
function poolAddressFromEnv(key: AeroPoolKey): Address | null {
  if (key === "avMEZOv-MUSD") {
    return (
      readOptionalAddress(process.env.NEXT_PUBLIC_AERO_AVMEZOV_MUSD_POOL) ??
      AERO_BASE_SEPOLIA_DEFAULTS.pools["avMEZOv-MUSD"]
    );
  }
  return (
    readOptionalAddress(process.env.NEXT_PUBLIC_AERO_AVBTCV_MUSD_POOL) ??
    AERO_BASE_SEPOLIA_DEFAULTS.pools["avBTCv-MUSD"]
  );
}

export function getAeroMusdAddress(): Address | null {
  return (
    readOptionalAddress(process.env.NEXT_PUBLIC_AERO_MUSD_ADDRESS) ??
    readOptionalAddress(process.env.NEXT_PUBLIC_AERO_DEMO_MUSD_ADDRESS) ??
    BASE_SEPOLIA_MUSD
  );
}

export function getAeroRouterConfig(): AeroRouterConfig {
  return {
    swapRouter:
      readOptionalAddress(process.env.NEXT_PUBLIC_AERO_SWAP_ROUTER) ??
      AERO_BASE_SEPOLIA_DEFAULTS.swapRouter,
    positionManager:
      readOptionalAddress(process.env.NEXT_PUBLIC_AERO_POSITION_MANAGER) ??
      AERO_BASE_SEPOLIA_DEFAULTS.positionManager,
  };
}

export function getAeroPoolConfigs(): AeroPoolConfig[] {
  const musd = getAeroMusdAddress();

  const rows: Array<Omit<AeroPoolConfig, "ready">> = [
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

export function getAeroPoolForAsset(asset: HorizonBridgeAsset): AeroPoolConfig {
  const pools = getAeroPoolConfigs();
  return pools.find((pool) => pool.asset === asset) ?? pools[0]!;
}

export function areAeroPoolsReady(pools = getAeroPoolConfigs()): boolean {
  return pools.length > 0 && pools.every((pool) => pool.ready);
}

export function getAeroDocs() {
  return DOCS;
}

export function getBaseSepoliaAddressUrl(address: Address): string {
  return `https://sepolia.basescan.org/address/${address}`;
}

export function shortAeroAddress(value: Address): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
