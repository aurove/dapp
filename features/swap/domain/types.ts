import type { Abi, Address, Hex } from "viem";
import type { PortfolioDomain } from "@/features/portfolio";

export type SwapTradeType = "exactInput" | "exactOutput";
export type SwapAssetForm = "underlying" | "venft" | "id20" | "tranche" | "erc20";

export interface SwapAsset {
  id: string;
  chainId: number;
  address: Address;
  executableAddress: Address;
  symbol: string;
  name: string;
  decimals: number;
  form: SwapAssetForm;
  balanceDomain: Extract<PortfolioDomain, "wallet" | "tranches" | "id20">;
  balanceKey: string;
  trancheId?: bigint;
  variant?: number;
  epochs?: bigint;
  wrapperAddress?: Address;
  tokenId?: bigint;
  fixedInputAmount?: bigint;
  isPermanent?: boolean;
}

export interface SwapPool {
  key: string;
  address: Address;
  abi: Abi;
  token0: Address;
  token1: Address;
  tickSpacing: number;
  fee: number;
}

export interface SwapBasicPool {
  key: string;
  address: Address;
  token0: Address;
  token1: Address;
  stable: boolean;
  factory: Address;
}

export interface SwapRegistry {
  chainId: number;
  revision: string;
  clRouter: { address: Address; abi: Abi };
  auroveRouter: { address: Address; abi: Abi };
  ledger: { address: Address; abi: Abi };
  basicRouter?: { address: Address; factory: Address; abi: Abi };
  assets: readonly SwapAsset[];
  pools: readonly SwapPool[];
  basicPools?: readonly SwapBasicPool[];
  routing: SwapRoutingConfig;
}

export interface SwapRoutingConfig {
  maxHops: number;
  maxCandidateRoutes: number;
  quoteTtlSeconds: bigint;
  quoteTimeoutMs: number;
}

export interface SwapIntent {
  chainId: number;
  account: Address;
  tokenIn: SwapAsset;
  tokenOut: SwapAsset;
  tradeType: SwapTradeType;
  amount: bigint;
  slippageBps: number;
  recipient: Address;
  deadline: bigint;
}

export type SwapVenue = "cl" | "basic";

export type SwapRouteLegType =
  | "AUROVE_DEPOSIT"
  | "AUROVE_ERC1155"
  | "AUROVE_WRAP"
  | "AUROVE_ZAP"
  | "CL_SWAP"
  | "V2_SWAP";

export interface SwapHop {
  pool: Address;
  poolKey: string;
  tokenIn: Address;
  tokenOut: Address;
  tickSpacing: number;
  fee: number;
  venue?: SwapVenue;
  stable?: boolean;
  factory?: Address;
}

export interface SwapRouteLeg {
  type: SwapRouteLegType;
  label: string;
  tokenIn?: Address;
  tokenOut?: Address;
  pool?: Address;
  venue?: SwapVenue;
  fee?: number;
}

export interface SwapRouteCandidate {
  id: string;
  label: string;
  tradeType: SwapTradeType;
  amountIn: bigint;
  amountOut: bigint;
  amountOutMinimum: bigint;
  amountInMaximum: bigint;
  priceImpactBps: number | null;
  encodedPath: Hex;
  hops: readonly SwapHop[];
  legs: readonly SwapRouteLeg[];
  hopCount: number;
  poolCount: number;
  venues: readonly SwapVenue[];
  estimatedTransactionCount: number;
  executable: boolean;
  rank: number;
}

export type SingleApprovalRequirement =
  | { kind: "erc20"; token: Address; spender: Address; amount: bigint }
  | { kind: "erc1155"; token: Address; operator: Address }
  | { kind: "erc721"; token: Address; operator: Address; tokenId: bigint };

export type ApprovalRequirement =
  | SingleApprovalRequirement
  | { kind: "batch"; approvals: readonly SingleApprovalRequirement[] }
  | { kind: "none" };

export interface SwapContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

interface BaseSwapPlan {
  routerAddress: Address;
  routerLabel: "Direct pool route" | "Aurove route" | "Mezo AMM";
  contractFunction: string;
  contractCall: SwapContractCall;
  approval: ApprovalRequirement;
  tradeType: SwapTradeType;
  amountSpecified: bigint;
  amountIn: bigint;
  amountOut: bigint;
  amountOutMinimum: bigint;
  amountInMaximum: bigint;
  encodedPath: Hex;
  hops: readonly SwapHop[];
  recipient: Address;
  deadline: bigint;
  expectedAsset: SwapAsset;
  affectedPortfolioDomains: readonly PortfolioDomain[];
}

export interface DirectClSwapPlan extends BaseSwapPlan {
  type: "directClSwap";
}
export interface DirectBasicSwapPlan extends BaseSwapPlan {
  type: "directBasicSwap";
}
export interface AuroveSwapPlan extends BaseSwapPlan {
  type: "auroveSwap";
  trancheId: bigint;
  wrapAmount: bigint;
}
export interface AuroveWrapThenSwapPlan extends BaseSwapPlan {
  type: "auroveWrapThenSwap";
  trancheId: bigint;
  wrapAmount: bigint;
}
export interface AuroveDepositWrapThenSwapPlan extends BaseSwapPlan {
  type: "auroveDepositWrapThenSwap";
  deposit: { variant: number; epochs: bigint; value: bigint };
}
export interface AuroveVeNftThenSwapPlan extends BaseSwapPlan {
  type: "auroveVeNftThenSwap";
  deposit: { variant: number; epochs: bigint; value: bigint };
  veNft: { address: Address; tokenId: bigint; isPermanent?: boolean; totalUnits: bigint; sellUnits: bigint; remainingUnits: bigint };
}
export interface AuroveVeNftDepositThenTrancheSwapPlan extends BaseSwapPlan {
  type: "auroveVeNftDepositThenTrancheSwap";
  deposit: { variant: number; epochs: bigint; value: bigint };
  trancheId: bigint;
  trancheSwapAmount: bigint;
  depositCall: SwapContractCall;
  swapCall: SwapContractCall;
  veNft: { address: Address; tokenId: bigint; isPermanent?: boolean; totalUnits: bigint; sellUnits: bigint; remainingUnits: bigint };
}
export interface UnsupportedSwapPlan {
  type: "unsupported";
  reason: string;
  hops?: readonly SwapHop[];
}

export type SwapExecutionPlan =
  | DirectClSwapPlan
  | DirectBasicSwapPlan
  | AuroveSwapPlan
  | AuroveWrapThenSwapPlan
  | AuroveDepositWrapThenSwapPlan
  | AuroveVeNftThenSwapPlan
  | AuroveVeNftDepositThenTrancheSwapPlan
  | UnsupportedSwapPlan;

export interface SwapQuote {
  routeId: string;
  routeLabel: string;
  tradeType: SwapTradeType;
  amountIn: bigint;
  amountOut: bigint;
  amountOutMinimum: bigint;
  amountInMaximum: bigint;
  priceImpactBps: number | null;
  quotedAtBlockTimestamp: bigint;
  blockNumber: bigint;
  expiresAtBlockTimestamp: bigint;
  encodedPath: Hex;
  hops: readonly SwapHop[];
  legs: readonly SwapRouteLeg[];
  routes: readonly SwapRouteCandidate[];
  candidateCount: number;
}

export type SwapRouteState =
  | "success"
  | "no-route"
  | "insufficient-liquidity"
  | "stale-quote"
  | "failed-simulation";

export type SwapRouteResult =
  | { status: "success"; quote: SwapQuote }
  | { status: Exclude<SwapRouteState, "success">; reason: string; candidateCount: number };
