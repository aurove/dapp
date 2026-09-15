import {
  encodeFunctionData,
  erc721Abi,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import type { PortfolioDomain } from "@/features/portfolio/types";
import {
  isTokenApprovalSatisfied,
  makeAddressWriteStep,
  makeTokenApprovalStep,
} from "@/lib/tx-flow/steps";
import type { TxStep, TxStepResult } from "@/lib/tx-flow/types";

export const UINT128_MAX = (1n << 128n) - 1n;

const ERC721_TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
  ],
} as const;

export function withPortfolioDomains(step: TxStep, domains: readonly PortfolioDomain[]) {
  if (step.type === "write") step.portfolioDomains = domains;
  return step;
}

export function encodeManagerCall(abi: Abi, functionName: string, args: readonly unknown[]): Hex {
  return encodeFunctionData({
    abi,
    functionName,
    args: args as never,
  });
}

export function buildManagerMulticallStep(params: {
  key: string;
  label: string;
  address: Address;
  abi: Abi;
  calls: readonly Hex[];
  domains: readonly PortfolioDomain[];
}): TxStep {
  return withPortfolioDomains(
    makeAddressWriteStep({
      key: params.key,
      label: params.label,
      displayLabelBtn: true,
      address: params.address,
      abi: params.abi,
      variables: { functionName: "multicall", args: [params.calls] },
    }) as TxStep,
    params.domains,
  );
}

export function encodeDecreaseLiquidityCall(params: {
  abi: Abi;
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
}) {
  return encodeManagerCall(params.abi, "decreaseLiquidity", [
    {
      tokenId: params.tokenId,
      liquidity: params.liquidity,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      deadline: params.deadline,
    },
  ]);
}

export function encodeCollectCall(params: {
  abi: Abi;
  tokenId: bigint;
  recipient: Address;
  amount0Max?: bigint;
  amount1Max?: bigint;
}) {
  return encodeManagerCall(params.abi, "collect", [
    {
      tokenId: params.tokenId,
      recipient: params.recipient,
      amount0Max: params.amount0Max ?? UINT128_MAX,
      amount1Max: params.amount1Max ?? UINT128_MAX,
    },
  ]);
}

export function encodeMintCall(params: {
  abi: Abi;
  token0: Address;
  token1: Address;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: Address;
  deadline: bigint;
  sqrtPriceX96?: bigint;
}) {
  return encodeManagerCall(params.abi, "mint", [
    {
      token0: params.token0,
      token1: params.token1,
      tickSpacing: params.tickSpacing,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Desired: params.amount0Desired,
      amount1Desired: params.amount1Desired,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      recipient: params.recipient,
      deadline: params.deadline,
      sqrtPriceX96: params.sqrtPriceX96 ?? 0n,
    },
  ]);
}

export function encodeBurnCall(abi: Abi, tokenId: bigint) {
  return encodeManagerCall(abi, "burn", [tokenId]);
}

export function buildRemoveLiquidityCalls(params: {
  abi: Abi;
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
  recipient: Address;
  burnEmptyNft: boolean;
}): Hex[] {
  const calls: Hex[] = [];
  if (params.liquidity > 0n) {
    calls.push(
      encodeDecreaseLiquidityCall({
        abi: params.abi,
        tokenId: params.tokenId,
        liquidity: params.liquidity,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        deadline: params.deadline,
      }),
    );
  }
  calls.push(
    encodeCollectCall({
      abi: params.abi,
      tokenId: params.tokenId,
      recipient: params.recipient,
    }),
  );
  if (params.burnEmptyNft) {
    calls.push(encodeBurnCall(params.abi, params.tokenId));
  }
  return calls;
}

export function buildRepositionCalls(params: {
  abi: Abi;
  tokenId: bigint;
  liquidity: bigint;
  decreaseAmount0Min: bigint;
  decreaseAmount1Min: bigint;
  deadline: bigint;
  recipient: Address;
  token0: Address;
  token1: Address;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
}): Hex[] {
  return [
    ...buildRemoveLiquidityCalls({
      abi: params.abi,
      tokenId: params.tokenId,
      liquidity: params.liquidity,
      amount0Min: params.decreaseAmount0Min,
      amount1Min: params.decreaseAmount1Min,
      deadline: params.deadline,
      recipient: params.recipient,
      burnEmptyNft: true,
    }),
    encodeMintCall({
      abi: params.abi,
      token0: params.token0,
      token1: params.token1,
      tickSpacing: params.tickSpacing,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Desired: params.amount0Desired,
      amount1Desired: params.amount1Desired,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      recipient: params.recipient,
      deadline: params.deadline,
    }),
  ];
}

export function mintedPositionTokenIdFromReceipt(params: {
  receipt?: Pick<TransactionReceipt, "logs">;
  managerAddress: Address;
  recipient: Address;
}): bigint | null {
  if (!params.receipt) return null;
  const manager = params.managerAddress.toLowerCase();
  const recipient = params.recipient.toLowerCase();
  const logs = parseEventLogs({
    abi: [ERC721_TRANSFER_EVENT],
    logs: params.receipt.logs.filter((log) => log.address.toLowerCase() === manager),
    eventName: "Transfer",
  });
  const minted = [...logs].reverse().find((log) => {
    const from = log.args.from?.toLowerCase();
    const to = log.args.to?.toLowerCase();
    return from === zeroAddress && to === recipient && log.args.tokenId !== undefined;
  });
  return minted?.args.tokenId ?? null;
}

export function buildErc20ApprovalStep(params: {
  key: string;
  label: string;
  token: Address;
  spender: Address;
  amount: bigint;
  domains?: readonly PortfolioDomain[];
}): TxStep {
  return withPortfolioDomains(
    makeTokenApprovalStep({
      key: params.key,
      label: params.label,
      displayLabelBtn: true,
      approval: {
        standard: "erc20",
        token: params.token,
        spender: params.spender,
        amount: params.amount,
      },
    }) as TxStep,
    params.domains ?? [],
  );
}

export function buildCollectFeesStep(params: {
  tokenId: bigint;
  recipient: Address;
  managerAddress: Address;
  managerAbi: Abi;
}): TxStep {
  return withPortfolioDomains(
    makeAddressWriteStep({
      key: `liquidity-collect-fees-${params.tokenId}`,
      label: "Collect fees",
      displayLabelBtn: true,
      address: params.managerAddress,
      abi: params.managerAbi,
      variables: {
        functionName: "collect",
        args: [{
          tokenId: params.tokenId,
          recipient: params.recipient,
          amount0Max: UINT128_MAX,
          amount1Max: UINT128_MAX,
        }],
      },
    }) as TxStep,
    ["liquidity", "wallet", "id20"],
  );
}

export function buildGaugeUnstakeStep(params: {
  tokenId: bigint;
  gaugeAddress: Address;
  gaugeAbi: Abi;
}): TxStep {
  return withPortfolioDomains(
    makeAddressWriteStep({
      key: `liquidity-unstake-${params.tokenId}`,
      label: "Unstake position from gauge",
      displayLabelBtn: true,
      address: params.gaugeAddress,
      abi: params.gaugeAbi,
      variables: { functionName: "withdraw", args: [params.tokenId] },
    }) as TxStep,
    ["liquidity", "rewards", "wallet"],
  );
}

export function buildGaugeClaimStep(params: {
  tokenId: bigint;
  gaugeAddress: Address;
  gaugeAbi: Abi;
}): TxStep {
  return withPortfolioDomains(
    makeAddressWriteStep({
      key: `liquidity-claim-rewards-${params.tokenId}`,
      label: "Claim gauge rewards",
      displayLabelBtn: true,
      address: params.gaugeAddress,
      abi: params.gaugeAbi,
      variables: { functionName: "getReward", args: [params.tokenId] },
    }) as TxStep,
    ["liquidity", "rewards", "wallet"],
  );
}

function gaugeNftApprovalStep(params: {
  tokenId: bigint;
  managerAddress: Address;
  gaugeAddress: Address;
}): TxStep {
  return withPortfolioDomains(
    makeTokenApprovalStep({
      key: `liquidity-stake-approve-${params.tokenId}`,
      label: "Approve position NFT for gauge",
      displayLabelBtn: true,
      approval: {
        standard: "erc721",
        token: params.managerAddress,
        operator: params.gaugeAddress,
        scope: { kind: "token", tokenId: params.tokenId },
      },
    }) as TxStep,
    ["liquidity"],
  );
}

function gaugeDepositStep(params: {
  tokenId: bigint;
  gaugeAddress: Address;
  gaugeAbi: Abi;
}): TxStep {
  return withPortfolioDomains(
    makeAddressWriteStep({
      key: `liquidity-stake-${params.tokenId}`,
      label: "Stake position in gauge",
      displayLabelBtn: true,
      address: params.gaugeAddress,
      abi: params.gaugeAbi,
      variables: { functionName: "deposit", args: [params.tokenId] },
    }) as TxStep,
    ["liquidity", "rewards"],
  );
}

export function buildGaugeStakeSteps(params: {
  tokenId: bigint;
  managerAddress: Address;
  gaugeAddress: Address;
  gaugeAbi: Abi;
}): TxStep[] {
  return [
    gaugeNftApprovalStep(params),
    gaugeDepositStep(params),
  ];
}

export function buildMintedNftStakeSteps(params: {
  managerAddress: Address;
  gaugeAddress: Address;
  gaugeAbi: Abi;
  recipient: Address;
  mintStepKey: string;
}): TxStep[] {
  const resolveTokenId = (prev: TxStepResult[]) => {
    const mintStep = prev.find((step) => step.key === params.mintStepKey);
    const tokenId = mintedPositionTokenIdFromReceipt({
      receipt: mintStep?.receipt,
      managerAddress: params.managerAddress,
      recipient: params.recipient,
    });
    if (tokenId === null) {
      throw new Error("The new position NFT was not found in the range-change transaction.");
    }
    return tokenId;
  };

  const approval = makeAddressWriteStep({
    key: "liquidity-stake-approve-minted",
    label: "Approve position NFT for gauge",
    displayLabelBtn: true,
    address: params.managerAddress,
    abi: erc721Abi,
    shouldSkip: (ctx) =>
      isTokenApprovalSatisfied(ctx, {
        standard: "erc721",
        token: params.managerAddress,
        operator: params.gaugeAddress,
        scope: { kind: "all" },
      }),
    variables: ({ prev }) => ({
      functionName: "approve" as const,
      args: [params.gaugeAddress, resolveTokenId(prev)],
    }),
  }) as unknown as TxStep;

  const deposit = makeAddressWriteStep({
    key: "liquidity-stake-minted",
    label: "Stake position in gauge",
    displayLabelBtn: true,
    address: params.gaugeAddress,
    abi: params.gaugeAbi,
    variables: ({ prev }) => ({
      functionName: "deposit",
      args: [resolveTokenId(prev)],
    }),
  }) as unknown as TxStep;

  return [
    withPortfolioDomains(approval, ["liquidity"]),
    withPortfolioDomains(deposit, ["liquidity", "rewards"]),
  ];
}

export function wrapWithFarmHandoff(params: {
  isStaked: boolean;
  restake: boolean;
  tokenId: bigint;
  managerAddress: Address;
  gaugeAddress?: Address;
  gaugeAbi?: Abi;
  account: Address;
  inner: TxStep[];
  mintedStepKey?: string;
}): TxStep[] {
  if (params.inner.length === 0) return [];
  const steps: TxStep[] = [];
  if (params.isStaked) {
    if (!params.gaugeAddress || !params.gaugeAbi) return [];
    steps.push(
      buildGaugeUnstakeStep({
        tokenId: params.tokenId,
        gaugeAddress: params.gaugeAddress,
        gaugeAbi: params.gaugeAbi,
      }),
    );
  }
  steps.push(...params.inner);
  if (params.restake && params.gaugeAddress && params.gaugeAbi) {
    if (params.mintedStepKey) {
      steps.push(
        ...buildMintedNftStakeSteps({
          managerAddress: params.managerAddress,
          gaugeAddress: params.gaugeAddress,
          gaugeAbi: params.gaugeAbi,
          recipient: params.account,
          mintStepKey: params.mintedStepKey,
        }),
      );
    } else {
      steps.push(
        ...buildGaugeStakeSteps({
          tokenId: params.tokenId,
          managerAddress: params.managerAddress,
          gaugeAddress: params.gaugeAddress,
          gaugeAbi: params.gaugeAbi,
        }),
      );
    }
  }
  return steps;
}
