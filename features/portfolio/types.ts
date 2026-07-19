import type { Address } from "viem";

export type PortfolioAssetId = string;
export type TrancheId = bigint;
export type TokenId = bigint;
export type PortfolioDomain = "wallet" | "tranches" | "id20" | "rewards" | "liquidity";

export interface RawTokenAmount { raw: bigint; decimals: number }
export interface PortfolioReadFailure {
  key: string;
  contract?: Address;
  functionName?: string;
  reason: string;
}
export interface PortfolioDomainMeta {
  chainId: number;
  owner: Address;
  blockNumber: bigint;
  fetchedAt: number;
  failures: readonly PortfolioReadFailure[];
}
export interface WalletPortfolio {
  meta: PortfolioDomainMeta;
  assets: Record<string, { address: Address; symbol: string; decimals: number; rawBalance: bigint }>;
  veCollections: Record<string, {
    address: Address;
    symbol: string;
    tokenIds: readonly bigint[];
    positions: Record<string, { tokenId: bigint; lockAmountRaw: bigint; lockEnd: bigint; isPermanent: boolean; availableFractionCapacityRaw: bigint }>;
  }>;
}
export interface TranchePortfolio {
  meta: PortfolioDomainMeta;
  balances: Record<string, { trancheId: bigint; variant: number; epochs: number; symbol: string; rawBalance: bigint }>;
}
export interface Id20Portfolio {
  meta: PortfolioDomainMeta;
  balances: Record<string, { trancheId: bigint; address: Address; symbol: string; decimals: number; rawBalance: bigint }>;
}
export interface RewardsPortfolio {
  meta: PortfolioDomainMeta;
  rewards: Record<string, { assetId: string; token: Address; symbol: string; decimals: number; rawClaimable: bigint; source: Address }>;
}
export interface LiquidityPortfolio {
  meta: PortfolioDomainMeta;
  positionIds: readonly bigint[];
  positions: Record<string, { tokenId: bigint; pool: Address; poolKey: string; token0: Address; token1: Address; tickSpacing: number; tickLower: number; tickUpper: number; liquidity: bigint; poolLiquidity?: bigint; currentTick?: number; sqrtPriceX96?: bigint; tokensOwed0: bigint; tokensOwed1: bigint; rawAmount0?: bigint; rawAmount1?: bigint }>;
}
export interface PortfolioSummary {
  owner: Address;
  chainId: number;
  blockNumber: bigint | null;
  domainBlockNumbers: Partial<Record<PortfolioDomain, bigint>>;
  walletAssets: WalletPortfolio["assets"];
  trancheBalances: TranchePortfolio["balances"];
  id20Balances: Id20Portfolio["balances"];
  rewards: RewardsPortfolio["rewards"];
  liquidityPositions: LiquidityPortfolio["positions"];
  failures: readonly PortfolioReadFailure[];
}

export interface PortfolioRegistry {
  revision: string;
  walletAssets: readonly { id: string; address: Address; symbol: string; decimals: number; type: "erc20" }[];
  tranches: readonly { key: string; trancheId: bigint; variant: number; epochs: number; symbol: string }[];
  id20s: readonly { key: string; trancheId: bigint; address: Address; symbol: string; decimals: number }[];
  rewardSources: readonly { key: string; address: Address; rewardToken: Address; symbol: string; decimals: number; assetId: string }[];
  veCollections: readonly { key: string; address: Address; symbol: string; abi: readonly unknown[] }[];
  ledger: Address;
  ledgerAbi: readonly unknown[];
  rewardSinkAbi: readonly unknown[];
  vault?: { address: Address; abi: readonly unknown[] };
  positionManager?: { address: Address; abi: readonly unknown[] };
  factory?: { address: Address; abi: readonly unknown[] };
  supportedPools: readonly { key: string; address: Address; abi: readonly unknown[] }[];
}
