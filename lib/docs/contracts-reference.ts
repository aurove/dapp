import { getAddress, type Address } from "viem";

/** Mezo mainnet chain id used by the production dApp and this documentation. */
export const MEZO_CHAIN_ID = 31612;

export const MEZO_EXPLORER = "https://explorer.mezo.org";
export const MEZO_RPC_HTTP = "https://rpc.mezo.org";
export const MEZO_NATIVE_SYMBOL = "BTC";
export const SOURCIFY_REPO_BASE = "https://repo.sourcify.dev/31612";

export type ContractKind =
  | "proxy"
  | "implementation"
  | "beacon"
  | "beacon-proxy"
  | "token"
  | "pool"
  | "gauge"
  | "factory"
  | "router"
  | "adapter"
  | "eoa";

export type VerificationSource = "blockscout" | "sourcify" | "both" | "none";

export type DeploymentPackage = "core" | "id20" | "mezo" | "cl";

export type DeploymentAvailability =
  | "dapp"
  | "integrator"
  | "admin"
  | "unconfigured"
  | "external";

export type DeploymentEntry = {
  id: string;
  name: string;
  address: Address;
  role: string;
  kind: ContractKind;
  package: DeploymentPackage;
  verification: VerificationSource;
  availability: DeploymentAvailability;
  /** Id of the proxy, beacon-proxy, or clone this implementation backs. */
  implements?: string;
  /** Id of the implementation or beacon this address delegates to. */
  implementation?: string;
  notes?: string;
};

function addr(value: string): Address {
  return getAddress(value);
}

/**
 * Canonical Mezo mainnet deployment inventory.
 * Addresses were resolved from live chain state at block 11,381,959, the dApp
 * 31612 registry, and the core/id20 mainnet deployment manifests. Do not copy
 * testnet or localhost addresses into this table.
 */
export const DEPLOYMENT_ENTRIES: readonly DeploymentEntry[] = [
  {
    id: "ledger",
    name: "Ledger",
    address: addr("0x0AF3601f0E15b8E33fEc660fBE515DDb6C54dD3c"),
    role: "ERC-1155 accounting surface for deposits, redemptions, and rebase claims.",
    kind: "proxy",
    package: "core",
    verification: "blockscout",
    availability: "dapp",
    implementation: "ledger-impl",
    notes: "UUPS proxy. Blockscout verifies this address as ERC1967Proxy.",
  },
  {
    id: "ledger-impl",
    name: "Ledger implementation",
    address: addr("0x1fa81cC4725E0Ff2D02BbE749e061233023392cf"),
    role: "Current Ledger logic behind the UUPS proxy.",
    kind: "implementation",
    package: "core",
    verification: "both",
    availability: "integrator",
    implements: "ledger",
  },
  {
    id: "vault",
    name: "Vault",
    address: addr("0x708E1B58bCDb05eF3a2CE9FbF9D1987F547238c9"),
    role: "Custodies veNFTs, deploys managers and sinks, and releases inventory on redeem.",
    kind: "proxy",
    package: "core",
    verification: "blockscout",
    availability: "dapp",
    implementation: "vault-impl",
    notes: "UUPS proxy. Blockscout verifies this address as ERC1967Proxy. Upgrades require the Ledger owner.",
  },
  {
    id: "vault-impl",
    name: "Vault implementation",
    address: addr("0x9ae8c9448Aa8D48bE255AF7730c6323ca01cAc44"),
    role: "Current Vault logic behind the UUPS proxy.",
    kind: "implementation",
    package: "core",
    verification: "both",
    availability: "integrator",
    implements: "vault",
  },
  {
    id: "manager-beacon",
    name: "VeNftManager beacon",
    address: addr("0x9F928c2e9Ec84917bE97C7fC5d9eceaF045DFdFD"),
    role: "Upgradeable beacon for both variant managers. Owned by the Ledger.",
    kind: "beacon",
    package: "core",
    verification: "blockscout",
    availability: "admin",
    implementation: "manager-impl",
  },
  {
    id: "manager-impl",
    name: "VeNftManager implementation",
    address: addr("0x9C21A7C6B87A785F976c54aDDbBd86f881Eb15FC"),
    role: "Current manager logic used by both beacon proxies.",
    kind: "implementation",
    package: "core",
    verification: "both",
    availability: "integrator",
    implements: "avbtcm-manager",
  },
  {
    id: "sink-beacon",
    name: "RewardSink beacon",
    address: addr("0xf0B96DA3d60F944970001f9045E84354030EF181"),
    role: "Upgradeable beacon for both tranche reward sinks. Owned by the Ledger.",
    kind: "beacon",
    package: "core",
    verification: "blockscout",
    availability: "admin",
    implementation: "sink-impl",
  },
  {
    id: "sink-impl",
    name: "RewardSink implementation",
    address: addr("0x2d76868FA68cf62765E6Ce558b596C6d1c4Bd82f"),
    role: "Current InstantRewards sink logic used by both beacon proxies.",
    kind: "implementation",
    package: "core",
    verification: "both",
    availability: "integrator",
    implements: "avbtcm-sink",
  },
  {
    id: "avbtcm-manager",
    name: "avBTCm manager",
    address: addr("0x3b3223C036D939Ece4aDc2a5Dd489423E4EF49FF"),
    role: "Owns the managed veBTC position for the avBTCm tranche.",
    kind: "beacon-proxy",
    package: "core",
    verification: "blockscout",
    availability: "integrator",
    implementation: "manager-beacon",
    notes: "Beacon proxy. Blockscout verifies this address against the VeNftManager source.",
  },
  {
    id: "avmezom-manager",
    name: "avMEZOm manager",
    address: addr("0x8210669B03313AAD9290D779f5cC4770992e1dd4"),
    role: "Owns the managed veMEZO position for the avMEZOm tranche.",
    kind: "beacon-proxy",
    package: "core",
    verification: "blockscout",
    availability: "integrator",
    implementation: "manager-beacon",
    notes: "Beacon proxy. Blockscout verifies this address against the VeNftManager source.",
  },
  {
    id: "avbtcm-sink",
    name: "avBTCm RewardSink",
    address: addr("0x249Cf321be802e2c7FFC3050F374060Fb2b5C5E0"),
    role: "Holds and distributes avBTCm ERC-1155 reward units.",
    kind: "beacon-proxy",
    package: "core",
    verification: "blockscout",
    availability: "dapp",
    implementation: "sink-beacon",
    notes: "Beacon proxy. Blockscout verifies this address against the RewardSink source.",
  },
  {
    id: "avmezom-sink",
    name: "avMEZOm RewardSink",
    address: addr("0xe379e4805EEEACe864FB6b35b43589B60d7b2577"),
    role: "Holds and distributes avMEZOm ERC-1155 reward units.",
    kind: "beacon-proxy",
    package: "core",
    verification: "blockscout",
    availability: "dapp",
    implementation: "sink-beacon",
    notes: "Beacon proxy. Blockscout verifies this address against the RewardSink source.",
  },
  {
    id: "id20-factory",
    name: "Id20Factory",
    address: addr("0xf7B7e122Ce45b48b53A8452188461bbDd115b935"),
    role: "Deploys one immutable AuroveId20 wrapper and Id20Gauge per tranche.",
    kind: "factory",
    package: "id20",
    verification: "both",
    availability: "integrator",
    notes: "Not upgradeable. No owner.",
  },
  {
    id: "zap-router",
    name: "AuroveZapRouter",
    address: addr("0x4d094eA480140e19f0e1488D31751b0dd7B757fa"),
    role: "Periphery router for deposit-wrap-swap and concentrated-liquidity entry.",
    kind: "router",
    package: "id20",
    verification: "both",
    availability: "dapp",
    notes: "Not upgradeable. No owner. Adapters are immutable and used via delegatecall.",
  },
  {
    id: "swap-adapter",
    name: "SwapAdapter",
    address: addr("0xC518081699deB3071bEe38f6D8C527ea95F03173"),
    role: "Zap router swap helper. Created in the ZapRouter constructor.",
    kind: "adapter",
    package: "id20",
    verification: "sourcify",
    availability: "integrator",
    notes: "Nested create. Sourcify runtime exact match; not verified on Blockscout.",
  },
  {
    id: "liquidity-adapter",
    name: "LiquidityAdapter",
    address: addr("0xf4dE7b8343DAa1cF4FAca35e128537eeB6447382"),
    role: "Zap router concentrated-liquidity helper. Created in the ZapRouter constructor.",
    kind: "adapter",
    package: "id20",
    verification: "sourcify",
    availability: "integrator",
    notes: "Nested create. Sourcify runtime exact match; not verified on Blockscout.",
  },
  {
    id: "avbtcm",
    name: "avBTCm",
    address: addr("0xf333171788dE7005695b2E8FB9cAE97Ba9c4dD7a"),
    role: "ERC-20 ID20 wrapper for the managed BTC tranche. 18 decimals.",
    kind: "token",
    package: "id20",
    verification: "sourcify",
    availability: "dapp",
    notes: "Sourcify runtime exact match; not verified on Blockscout. rewardSink() returns the Id20Gauge.",
  },
  {
    id: "avmezom",
    name: "avMEZOm",
    address: addr("0xb894b11A78B762c82Cb095148F5BC11DC93C3560"),
    role: "ERC-20 ID20 wrapper for the managed MEZO tranche. 18 decimals.",
    kind: "token",
    package: "id20",
    verification: "sourcify",
    availability: "dapp",
    notes: "Sourcify runtime exact match; not verified on Blockscout. rewardSink() returns the Id20Gauge.",
  },
  {
    id: "avbtcm-gauge",
    name: "avBTCm Id20Gauge",
    address: addr("0xA01D63da69A946747a0065bDaEa8c5f6ac4E6fdf"),
    role: "Instant ID20 reward gauge for avBTCm holders who activate.",
    kind: "gauge",
    package: "id20",
    verification: "sourcify",
    availability: "dapp",
    notes: "Created by the avBTCm wrapper. Sourcify runtime exact match; not verified on Blockscout.",
  },
  {
    id: "avmezom-gauge",
    name: "avMEZOm Id20Gauge",
    address: addr("0xB50A13B20bBCC48D28fb728961B79334b8527aBD"),
    role: "Instant ID20 reward gauge for avMEZOm holders who activate.",
    kind: "gauge",
    package: "id20",
    verification: "sourcify",
    availability: "dapp",
    notes: "Created by the avMEZOm wrapper. Sourcify runtime exact match; not verified on Blockscout.",
  },
  {
    id: "pool-musd-avbtcm",
    name: "MUSD / avBTCm pool",
    address: addr("0xB018BED3b3376cE95ee34db170348FA16d18e29D"),
    role: "Concentrated-liquidity pool for MUSD and avBTCm. Tick spacing 200.",
    kind: "pool",
    package: "cl",
    verification: "none",
    availability: "dapp",
    implementation: "cl-pool-impl",
    notes:
      "CLFactory clone. The clone address is not independently verified on Blockscout or Sourcify. The CLPool implementation is verified on Blockscout. No Mezo pool gauge is configured.",
  },
  {
    id: "pool-avbtcm-avmezom",
    name: "avBTCm / avMEZOm pool",
    address: addr("0xE639b9B1fb72C8ea2Fea246Ba0ad0ed7ddfB0E1C"),
    role: "Concentrated-liquidity pool for avMEZOm and avBTCm. Tick spacing 200.",
    kind: "pool",
    package: "cl",
    verification: "none",
    availability: "dapp",
    implementation: "cl-pool-impl",
    notes:
      "CLFactory clone. The clone address is not independently verified on Blockscout or Sourcify. The CLPool implementation is verified on Blockscout. token0 is avMEZOm, token1 is avBTCm. No Mezo pool gauge is configured.",
  },
  {
    id: "cl-factory",
    name: "CLFactory",
    address: addr("0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79"),
    role: "Mezo concentrated-liquidity pool factory used by Aurove pools.",
    kind: "factory",
    package: "cl",
    verification: "blockscout",
    availability: "external",
  },
  {
    id: "cl-pool-impl",
    name: "CLPool implementation",
    address: addr("0x819CfAdd7F5bc0854FA3B7F5749ea0410a943E5F"),
    role: "Logic contract for Mezo CL pool clones, including both Aurove pools.",
    kind: "implementation",
    package: "cl",
    verification: "blockscout",
    availability: "external",
    implements: "pool-musd-avbtcm",
  },
  {
    id: "cl-swap-router",
    name: "CLSwapRouter",
    address: addr("0x37cDd11919ec3860eaD9efB8673d7476E5326225"),
    role: "Mezo concentrated-liquidity swap router used by Aurove Swap.",
    kind: "router",
    package: "cl",
    verification: "blockscout",
    availability: "dapp",
  },
  {
    id: "npm",
    name: "NonfungiblePositionManager",
    address: addr("0x509Bc221df2B83927c695FA0bb0f5B21053C874c"),
    role: "Mints, increases, collects, and burns Mezo CL position NFTs.",
    kind: "router",
    package: "cl",
    verification: "blockscout",
    availability: "dapp",
  },
  {
    id: "cl-gauge-factory",
    name: "CLGaugeFactory",
    address: addr("0xfc41E1AAe0e58E8bDC32e85d8C995A902FEdEb13"),
    role: "Mezo factory that would create pool gauges after voter whitelist.",
    kind: "factory",
    package: "cl",
    verification: "blockscout",
    availability: "unconfigured",
    notes: "Blockscout verifies this address. No Aurove pool gauge has been created.",
  },
  {
    id: "btc",
    name: "BTC",
    address: addr("0x7b7C000000000000000000000000000000000000"),
    role: "Mezo native BTC ERC-20 used for deposits and gas. 18 decimals.",
    kind: "token",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
  },
  {
    id: "mezo",
    name: "MEZO",
    address: addr("0x7B7c000000000000000000000000000000000001"),
    role: "Mezo ERC-20 used for deposits. 18 decimals.",
    kind: "token",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
  },
  {
    id: "musd",
    name: "MUSD",
    address: addr("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"),
    role: "Mezo USD stablecoin. Quote asset in the MUSD / avBTCm pool. 18 decimals.",
    kind: "token",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
  },
  {
    id: "vebtc",
    name: "veBTC",
    address: addr("0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279"),
    role: "Mezo Earn voting-escrow NFT for locked BTC.",
    kind: "proxy",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implementation: "vebtc-impl",
    notes: "Transparent proxy. Blockscout verifies this address as TransparentUpgradeableProxy.",
  },
  {
    id: "vebtc-impl",
    name: "veBTC implementation",
    address: addr("0x2a05272B526e3Dc2E42B6b4D6E926E83de9be65c"),
    role: "Current veBTC logic behind the Mezo transparent proxy.",
    kind: "implementation",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implements: "vebtc",
  },
  {
    id: "vemezo",
    name: "veMEZO",
    address: addr("0xb90fdAd3DFD180458D62Cc6acedc983D78E20122"),
    role: "Mezo Earn voting-escrow NFT for locked MEZO.",
    kind: "proxy",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implementation: "vemezo-impl",
    notes: "Transparent proxy. Blockscout verifies this address as TransparentUpgradeableProxy.",
  },
  {
    id: "vemezo-impl",
    name: "veMEZO implementation",
    address: addr("0xA1aCc19aa9f7010c0013d8f043aff63A0527Dd5e"),
    role: "Current veMEZO logic behind the Mezo transparent proxy.",
    kind: "implementation",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implements: "vemezo",
  },
  {
    id: "voter",
    name: "Pool Voter",
    address: addr("0x48233cCC97B87Ba93bCA212cbEe48e3210211f03"),
    role: "Canonical Mezo pool voter for gauges, token whitelist, and voting incentives.",
    kind: "proxy",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implementation: "voter-impl",
    notes: "Transparent proxy. avBTCm and avMEZOm are not currently whitelisted.",
  },
  {
    id: "voter-impl",
    name: "Pool Voter implementation",
    address: addr("0xA62060D57e04d6c799B58188dc654B85ADdD1465"),
    role: "Current pool Voter logic behind the Mezo transparent proxy.",
    kind: "implementation",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implements: "voter",
  },
  {
    id: "boost-voter",
    name: "BoostVoter",
    address: addr("0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1"),
    role: "Mezo boost voter used by managed veMEZO operations.",
    kind: "proxy",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implementation: "boost-voter-impl",
  },
  {
    id: "boost-voter-impl",
    name: "BoostVoter implementation",
    address: addr("0xA696Dc56522E41811D06BBDA83c1a6D976637624"),
    role: "Current BoostVoter logic behind the Mezo transparent proxy.",
    kind: "implementation",
    package: "mezo",
    verification: "blockscout",
    availability: "external",
    implements: "boost-voter",
  },
  {
    id: "ledger-owner",
    name: "Ledger owner",
    address: addr("0x7B64129635102f7bE831688CF20B4c900fba1653"),
    role: "Accepted Ownable2Step owner of the Ledger. Authorizes upgrades and fee proposals.",
    kind: "eoa",
    package: "core",
    verification: "none",
    availability: "admin",
    notes: "Externally owned account. Not a verified contract.",
  },
] as const;

export type DeploymentId = (typeof DEPLOYMENT_ENTRIES)[number]["id"];

export const DEPLOYMENT_BY_ID: Record<string, DeploymentEntry> = Object.fromEntries(
  DEPLOYMENT_ENTRIES.map((entry) => [entry.id, entry]),
);

export const CORE_ENTRIES = DEPLOYMENT_ENTRIES.filter((entry) => entry.package === "core");
export const ID20_ENTRIES = DEPLOYMENT_ENTRIES.filter((entry) => entry.package === "id20");
export const CL_ENTRIES = DEPLOYMENT_ENTRIES.filter((entry) => entry.package === "cl");
export const MEZO_ENTRIES = DEPLOYMENT_ENTRIES.filter((entry) => entry.package === "mezo");

export type TrancheProduct = {
  product: "avBTCm" | "avMEZOm";
  variant: 1 | 2;
  epochs: 4 | 208;
  trancheId: 65540 | 131280;
  trancheIdHex: "0x010004" | "0x0200d0";
  erc1155Name: string;
  id20Name: string;
  symbol: "avBTCm" | "avMEZOm";
  underlying: "BTC" | "MEZO";
  veNft: "veBTC" | "veMEZO";
  managerId: DeploymentId;
  sinkId: DeploymentId;
  id20Id: DeploymentId;
  gaugeId: DeploymentId;
};

export const TRANCHE_PRODUCTS: readonly TrancheProduct[] = [
  {
    product: "avBTCm",
    variant: 1,
    epochs: 4,
    trancheId: 65540,
    trancheIdHex: "0x010004",
    erc1155Name: "Liquid locked BTC - Managed",
    id20Name: "Liquid locked BTC - Managed",
    symbol: "avBTCm",
    underlying: "BTC",
    veNft: "veBTC",
    managerId: "avbtcm-manager",
    sinkId: "avbtcm-sink",
    id20Id: "avbtcm",
    gaugeId: "avbtcm-gauge",
  },
  {
    product: "avMEZOm",
    variant: 2,
    epochs: 208,
    trancheId: 131280,
    trancheIdHex: "0x0200d0",
    erc1155Name: "Liquid locked MEZO - Managed",
    id20Name: "Liquid locked MEZO - Managed",
    symbol: "avMEZOm",
    underlying: "MEZO",
    veNft: "veMEZO",
    managerId: "avmezom-manager",
    sinkId: "avmezom-sink",
    id20Id: "avmezom",
    gaugeId: "avmezom-gauge",
  },
];

export const LEDGER_COLLECTION = {
  name: "Liquid locked veNFTs - Aurove",
  symbol: "avNFTs",
  decimals: 18,
  uri: "https://api.aurove.xyz/tranches/{id}.json",
} as const;

export function explorerAddressUrl(address: string, tab: "contract" | "txs" = "contract"): string {
  const checksummed = getAddress(address);
  if (tab === "contract") {
    return `${MEZO_EXPLORER}/address/${checksummed}?tab=contract`;
  }
  return `${MEZO_EXPLORER}/address/${checksummed}`;
}

export function sourcifyVerificationUrl(address: string): string {
  return `${SOURCIFY_REPO_BASE}/${getAddress(address)}`;
}

export function verificationHref(entry: DeploymentEntry): string | null {
  if (entry.verification === "none") return null;
  if (entry.verification === "sourcify") return sourcifyVerificationUrl(entry.address);
  return explorerAddressUrl(entry.address, "contract");
}

export function verificationLabel(entry: DeploymentEntry): string | null {
  if (entry.verification === "blockscout" || entry.verification === "both") {
    return "Verified on Blockscout";
  }
  if (entry.verification === "sourcify") return "Verified on Sourcify";
  return null;
}

export function entryById(id: string): DeploymentEntry {
  const entry = DEPLOYMENT_BY_ID[id];
  if (!entry) throw new Error(`Unknown deployment id: ${id}`);
  return entry;
}

export const UNVERIFIED_CLONE_IDS = ["pool-musd-avbtcm", "pool-avbtcm-avmezom"] as const;

/**
 * Snapshot of launch-blocking Mezo configuration read at block 11,381,959.
 * Docs should treat these as current production facts until they change on-chain.
 */
export const PRODUCTION_LAUNCH_STATE = {
  block: 11_381_959,
  avBtcManagerMTokenId: 0n,
  avMezoManagerMTokenId: 0n,
  avBtcTrancheSupply: 0n,
  avMezoTrancheSupply: 0n,
  avBtcId20Supply: 0n,
  avMezoId20Supply: 0n,
  vaultCanSplitVeBtc: false,
  avBtcWhitelistedOnVoter: false,
  avMezoWhitelistedOnVoter: false,
  musdAvBtcPoolGauge: "0x0000000000000000000000000000000000000000",
  avBtcAvMezoPoolGauge: "0x0000000000000000000000000000000000000000",
} as const;
