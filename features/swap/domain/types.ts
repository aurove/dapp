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

export interface SwapRegistry {
  chainId: number;
  revision: string;
  clRouter: { address: Address; abi: Abi };
  auroveRouter: { address: Address; abi: Abi };
  ledger: { address: Address; abi: Abi };
  assets: readonly SwapAsset[];
  pools: readonly SwapPool[];
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

export interface SwapHop {
  pool: Address;
  poolKey: string;
  tokenIn: Address;
  tokenOut: Address;
  tickSpacing: number;
  fee: number;
}

export type ApprovalRequirement =
  | { kind: "erc20"; token: Address; spender: Address; amount: bigint }
  | { kind: "erc1155"; token: Address; operator: Address }
  | { kind: "erc721"; token: Address; operator: Address; tokenId: bigint }
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
  routerLabel: "Direct pool route" | "Aurove route";
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

export interface DirectClSwapPlan extends BaseSwapPlan { type: "directClSwap" }
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
}
export interface UnsupportedSwapPlan {
  type: "unsupported";
  reason: string;
  hops?: readonly SwapHop[];
}

export type SwapExecutionPlan =
  | DirectClSwapPlan
  | AuroveSwapPlan
  | AuroveWrapThenSwapPlan
  | AuroveDepositWrapThenSwapPlan
  | AuroveVeNftThenSwapPlan
  | UnsupportedSwapPlan;

export interface SwapQuote {
  tradeType: SwapTradeType;
  amountIn: bigint;
  amountOut: bigint;
  amountOutMinimum: bigint;
  amountInMaximum: bigint;
  priceImpactBps: number | null;
  quotedAtBlockTimestamp: bigint;
  blockNumber: bigint;
}
