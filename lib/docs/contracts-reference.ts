/**
 * Deployed Aurove contracts on Mezo Testnet (chain id 31611).
 * Addresses sourced from packages/core and packages/id20 deployment artifacts.
 * Only document contracts that exist in the dapp registry / deployments.
 */

export type ContractReference = {
  name: string;
  purpose: string;
  address: `0x${string}` | null;
  package: "core" | "id20" | "mezo" | "cl";
  status: "live" | "in-development" | "planned";
  interfaces?: string[];
  functions: Array<{ name: string; description: string }>;
  events: Array<{ name: string; description: string }>;
  permissions?: string[];
};

export const MEZO_TESTNET_CHAIN_ID = 31611;
export const MEZO_TESTNET_EXPLORER = "https://explorer.test.mezo.org";

export const TESTNET_CONTRACTS: ContractReference[] = [
  {
    name: "Ledger",
    purpose:
      "Central ERC1155 accounting surface for Aurove tranche receipts. Entry point for deposits, redemptions, rebase claims, and fee configuration.",
    address: "0xE276fB7B0376aBbb1a11B14f31E3773C331aE7D7",
    package: "core",
    status: "live",
    interfaces: ["ILedger", "IERC1155"],
    functions: [
      {
        name: "depositErc20(variant, epochs, amount, to)",
        description: "Lock BTC or MEZO into a managed tranche and mint ERC1155 shares.",
      },
      {
        name: "depositVeNft(variant, epochs, tokenId, to)",
        description: "Deposit an existing Mezo Earn veNFT and mint liquid tranche shares.",
      },
      {
        name: "redeem(trancheId, amount, receiver, tokenIds)",
        description: "Burn shares and release vault inventory during the weekly settlement window.",
      },
      {
        name: "claimRebases(trancheIds)",
        description: "Permissionlessly claim Mezo rebases into the tranche RewardSink.",
      },
      {
        name: "redeemableBalanceOf(account, trancheId)",
        description: "View redeemable balance after redeem locks.",
      },
    ],
    events: [
      { name: "VeNftDeposited", description: "Emitted when a veNFT is deposited and shares are minted." },
      { name: "VeNftWithdrawn", description: "Emitted when inventory is released on redemption." },
      { name: "RebaseClaimed", description: "Emitted when manager rebases are claimed and reward units minted." },
    ],
    permissions: [
      "Anyone may deposit, redeem (in window), and claim rebases.",
      "Owner configures vault and fee proposals.",
    ],
  },
  {
    name: "Vault",
    purpose:
      "Custodies veNFT inventory, deploys per-variant VeNftManager and RewardSink pairs, and handles release on redemption.",
    address: "0x134bEDB1aC051CD9DcdC2C340f86382Ca367976F",
    package: "core",
    status: "live",
    interfaces: ["IVault"],
    functions: [
      {
        name: "onERC721Received(...)",
        description: "Accepts veNFTs from the Ledger and deposits them into Mezo managed positions.",
      },
      {
        name: "releaseVeBtc / releaseVeMezo",
        description: "Release inventory for redemptions (BTC path supports exact-amount splits).",
      },
    ],
    events: [],
    permissions: ["Ledger-orchestrated custody; managers are maintainable for operational Mezo actions."],
  },
  {
    name: "avBTCmManager",
    purpose: "Owns the empty MANAGED veBTC position used for Aurove BTC managed yield.",
    address: "0xb9d175Ec7b98A5E1D9671Ca09E20764A1cB143F6",
    package: "core",
    status: "live",
    interfaces: ["IVeNftManager"],
    functions: [
      { name: "claimRebases()", description: "Claim Mezo distributor rebases (Ledger-gated)." },
      { name: "vote / claimBribes / claimFees", description: "Governance and reward operations for maintainers." },
    ],
    events: [],
    permissions: ["Ledger for claimRebases; voteMaintainers / swapMaintainers for ops."],
  },
  {
    name: "avMEZOmManager",
    purpose: "Owns the empty MANAGED veMEZO position used for Aurove MEZO managed yield.",
    address: "0x1e1fabA47C07EB7Fa104B201435de6Fa64D6c7E7",
    package: "core",
    status: "live",
    interfaces: ["IVeNftManager"],
    functions: [
      { name: "claimRebases()", description: "Claim Mezo distributor rebases (Ledger-gated)." },
    ],
    events: [],
  },
  {
    name: "avBTCmSink",
    purpose: "RewardSink for BTC managed tranche — distributes rebases via RetroactiveCreditRewards.",
    address: "0xC3A9810447c143774b86f2CE4413E446e2E0dFB0",
    package: "core",
    status: "live",
    interfaces: ["IRewardSink", "IRewardAccounting"],
    functions: [
      { name: "claimRewards(recipient)", description: "Claim claimable reward units for the caller." },
      { name: "claimRewardsAndCall(data)", description: "Claim and atomically notify an ID20 gauge." },
      { name: "syncRewardFunding()", description: "Detect newly minted rebases, charge fee, notify accounting." },
    ],
    events: [],
  },
  {
    name: "avMEZOmSink",
    purpose: "RewardSink for MEZO managed tranche.",
    address: "0xA17e19dFf6Aa31d31D6456ECc11F73eb5a9EFB37",
    package: "core",
    status: "live",
    interfaces: ["IRewardSink"],
    functions: [
      { name: "claimRewards(recipient)", description: "Claim claimable reward units for the caller." },
    ],
    events: [],
  },
  {
    name: "Id20Factory",
    purpose: "Deploys AuroveId20 wrappers and linked Id20Gauges for registered tranches.",
    address: "0xf2aeA42373818D32e20d4F901C870277fBf7E3cE",
    package: "id20",
    status: "live",
    interfaces: ["IId20Factory"],
    functions: [
      { name: "create / getId20", description: "Create or resolve the ID20 for a tranche id." },
    ],
    events: [],
  },
  {
    name: "avBTCmId20",
    purpose:
      "ERC20 wrapper (AuroveId20) for the managed BTC tranche. 1:1 backed by Ledger ERC1155 shares with surplus-backing awareness.",
    address: "0x185E70EbFB606Ea8F3365A2952AD3aA677210366",
    package: "id20",
    status: "live",
    interfaces: ["IId20", "IAuroveId20", "IERC20"],
    functions: [
      { name: "unwrap(amount, to)", description: "Burn ERC20 and release underlying ERC1155 tranche shares." },
      { name: "claimRewards()", description: "Harvest from Aurove RewardSink into the Id20Gauge." },
      { name: "backingBalance() / surplusBacking()", description: "View backing and excess ERC1155 held by the wrapper." },
      { name: "activate()", description: "Activate gauge reward participation for the holder (via gauge)." },
    ],
    events: [
      { name: "WrappedFromReceived", description: "ERC1155 received → ERC20 minted." },
      { name: "Unwrapped", description: "ERC20 burned → ERC1155 released." },
    ],
  },
  {
    name: "avMEZOmId20",
    purpose: "ERC20 wrapper for the managed MEZO tranche.",
    address: "0x99DBba550D4bFD8c83fFaE9711b243B5ef6Ef082",
    package: "id20",
    status: "live",
    interfaces: ["IId20", "IAuroveId20", "IERC20"],
    functions: [
      { name: "unwrap(amount, to)", description: "Burn ERC20 and release underlying ERC1155." },
      { name: "claimRewards()", description: "Harvest MEZO sink rewards into the gauge." },
    ],
    events: [
      { name: "WrappedFromReceived", description: "Wrap event." },
      { name: "Unwrapped", description: "Unwrap event." },
    ],
  },
  {
    name: "avBTCmGauge",
    purpose: "Id20Gauge for avBTCm — continuous high-precision reward distribution with credit/debt weight lending.",
    address: "0x6764de0fF406E677673cC07e6220c581E3004087",
    package: "id20",
    status: "live",
    interfaces: ["IId20Gauge"],
    functions: [
      { name: "activate()", description: "Begin earning on held ID20 balance." },
      { name: "claim(receiver)", description: "Claim accrued gauge rewards." },
      { name: "settleCredit(...)", description: "Reconcile transferable credit into active weight." },
    ],
    events: [],
  },
  {
    name: "avMEZOmGauge",
    purpose: "Id20Gauge for avMEZOm liquid MEZO product.",
    address: "0x9D3D130b7b4835911141F6F80A92c88a7a7265F6",
    package: "id20",
    status: "live",
    interfaces: ["IId20Gauge"],
    functions: [
      { name: "activate()", description: "Begin earning gauge rewards." },
      { name: "claim(receiver)", description: "Claim accrued rewards." },
    ],
    events: [],
  },
  {
    name: "AuroveZapRouter",
    purpose:
      "Periphery router that deposits ERC20/veNFT/tranche inventory, wraps to ID20, swaps via CL routes, and adds concentrated liquidity in one flow.",
    address: "0xDC49CF19e824e614fa4a8E2d451ce1e633270CD5",
    package: "id20",
    status: "live",
    interfaces: ["IAuroveZapRouter"],
    functions: [
      {
        name: "addLiquidityErc20Erc20 / …VeNft / …Tranche variants",
        description: "Ordered liquidity entrypoints by input asset kinds.",
      },
      {
        name: "increaseLiquidity* variants",
        description: "Increase existing CL NFT liquidity from mixed funding sources.",
      },
      {
        name: "zap / swap helpers",
        description: "Deposit → wrap → CL swap plans used by the Swap UI.",
      },
    ],
    events: [
      { name: "LiquidityAdded", description: "New CL position minted via zap." },
      { name: "LiquidityIncreased", description: "Existing position liquidity increased." },
    ],
  },
  {
    name: "MUSD-avBTCm (CL Pool)",
    purpose: "Concentrated liquidity pool for MUSD / avBTCm.",
    address: "0x7CB429Fb07574e9b379fa847aCCEBf5D83885D5A",
    package: "cl",
    status: "live",
    functions: [],
    events: [],
  },
  {
    name: "avBTCm-avMEZOm (CL Pool)",
    purpose: "Concentrated liquidity pool for avBTCm / avMEZOm.",
    address: "0x56543F5E69B610c44aD1089B695B5dED095FB6bd",
    package: "cl",
    status: "live",
    functions: [],
    events: [],
  },
  {
    name: "CLSwapRouter",
    purpose: "Mezo Slipstream-style swap router used by Aurove swap routing.",
    address: "0x3112908bb72ce9c26a321eeb22ec8e051f3b6e6a",
    package: "cl",
    status: "live",
    functions: [],
    events: [],
  },
  {
    name: "NonfungiblePositionManager",
    purpose: "CL position NFT manager for mint / increase / collect / burn.",
    address: "0x9b753e11bfed0d88f6e1d2777e3c7dac42f96062",
    package: "cl",
    status: "live",
    functions: [],
    events: [],
  },
  {
    name: "VeBTC",
    purpose: "Mezo Earn voting-escrow NFT for locked BTC (external Mezo protocol).",
    address: "0x38e35d92e6bfc6787272a62345856b13ea12130a",
    package: "mezo",
    status: "live",
    functions: [],
    events: [],
  },
  {
    name: "VeMEZO",
    purpose: "Mezo Earn voting-escrow NFT for locked MEZO (external Mezo protocol).",
    address: "0xace816ca2bcc9b12c59799dcc5a959fb9b98111b",
    package: "mezo",
    status: "live",
    functions: [],
    events: [],
  },
];

export function explorerAddressUrl(address: string): string {
  return `${MEZO_TESTNET_EXPLORER}/address/${address}`;
}
