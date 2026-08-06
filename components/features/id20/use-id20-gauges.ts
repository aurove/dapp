"use client";

import { useCallback, useMemo } from "react";
import { useReadContracts } from "wagmi";
import { parseAbiItem, type Abi, type Address } from "viem";

import { getContractConfig, getContractDeploymentBlock } from "@/contracts/shared";
import { useId20Portfolio } from "@/features/portfolio";
import {
  makeAddressWriteStep,
  type TxFlowRuntimeContext,
  type TxPreparedWriteStep,
  type TxStep,
} from "@/lib/tx-flow";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";

const ID20_CONTRACTS = [
  { key: "avBTCm", id20Name: "avBTCmId20", gaugeName: "avBTCmGauge" },
  { key: "avMEZOm", id20Name: "avMEZOmId20", gaugeName: "avMEZOmGauge" },
] as const;

/** Cap repeated settle txs for a single exit flow (one loan per step). */
const MAX_CREDIT_SETTLE_STEPS = 8;
const CREDIT_ISSUED_LOG_CHUNK = 50_000n;

const creditIssuedEvent = parseAbiItem(
  "event CreditIssued(address indexed lender, address indexed borrower, uint256 amount)",
);

export type Id20GaugeDescriptor = {
  key: string;
  id20Address: Address;
  id20Abi: Abi;
  gaugeAbi: Abi;
  symbol: string;
  decimals: number;
};

export type Id20GaugePosition = Id20GaugeDescriptor & {
  gaugeAddress: Address;
  balanceRaw: bigint;
  isActive: boolean;
  weightRaw: bigint;
  debtRaw: bigint;
  creditRaw: bigint;
  lentRaw: bigint;
  claimableRaw: bigint;
};

type GaugeMetadata = {
  isActive: boolean;
  weight: bigint;
  debt: bigint;
  credit: bigint;
  lent: bigint;
  accruedReward: bigint;
};

function readAddress(value: unknown): Address | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value as Address : null;
}

function readGaugeMetadata(value: unknown): GaugeMetadata | null {
  if (Array.isArray(value)) {
    const [isActive, weight, debt, credit, lent, accruedReward] = value;
    if (
      typeof isActive !== "boolean" ||
      ![weight, debt, credit, lent, accruedReward].every((item) => typeof item === "bigint")
    ) return null;
    return { isActive, weight, debt, credit, lent, accruedReward };
  }

  if (!value || typeof value !== "object") return null;
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.isActive !== "boolean" ||
    ![metadata.weight, metadata.debt, metadata.credit, metadata.lent, metadata.accruedReward]
      .every((item) => typeof item === "bigint")
  ) return null;
  return {
    isActive: metadata.isActive,
    weight: metadata.weight as bigint,
    debt: metadata.debt as bigint,
    credit: metadata.credit as bigint,
    lent: metadata.lent as bigint,
    accruedReward: metadata.accruedReward as bigint,
  };
}

export function getId20GaugeDescriptors(chainId: number): Id20GaugeDescriptor[] {
  return ID20_CONTRACTS.flatMap(({ key, id20Name, gaugeName }) => {
    const id20 = getContractConfig(chainId, id20Name);
    const gauge = getContractConfig(chainId, gaugeName);
    if (!id20?.address || !id20.abi || !gauge?.abi) return [];
    return [{
      key,
      id20Address: id20.address,
      id20Abi: id20.abi as Abi,
      gaugeAbi: gauge.abi as Abi,
      symbol: key,
      decimals: 18,
    }];
  });
}

export function getLiquidityId20GaugeDescriptors(
  chainId: number,
  tokenAddresses: readonly (Address | null | undefined)[],
) {
  const tokens = new Set(tokenAddresses.filter(Boolean).map((address) => address!.toLowerCase()));
  return getId20GaugeDescriptors(chainId).filter((item) => tokens.has(item.id20Address.toLowerCase()));
}

async function resolveGaugeAddress(
  ctx: Pick<TxFlowRuntimeContext, "publicClient">,
  descriptor: Id20GaugeDescriptor,
) {
  return ctx.publicClient.readContract({
    address: descriptor.id20Address,
    abi: descriptor.id20Abi,
    functionName: "rewardSink",
  } as never) as Promise<Address>;
}

async function isGaugeActive(ctx: TxFlowRuntimeContext, descriptor: Id20GaugeDescriptor) {
  const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
  const metadata = await ctx.publicClient.readContract({
    address: gaugeAddress,
    abi: descriptor.gaugeAbi,
    functionName: "accountMetadata",
    args: [ctx.account],
  } as never);
  return readGaugeMetadata(metadata)?.isActive === true;
}

export function makeId20ActivationStep(
  descriptor: Id20GaugeDescriptor,
  displayLabelBtn = false,
): TxPreparedWriteStep {
  return {
    type: "write",
    key: `id20-activate-${descriptor.key}`,
    label: `Activate ${descriptor.symbol} rewards`,
    displayLabelBtn,
    portfolioDomains: ["id20", "rewards"],
    shouldSkip: (ctx) => isGaugeActive(ctx, descriptor),
    prepare: async (ctx) => {
      const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
      return {
        contract: { address: gaugeAddress, abi: descriptor.gaugeAbi },
        request: { functionName: "activate", args: [] },
      } as never;
    },
  };
}

export function makeId20ActivationGuardSteps(
  descriptor: Id20GaugeDescriptor,
): TxStep[] {
  return [
    makeId20ActivationStep(descriptor, true),
    {
      type: "custom",
      key: `id20-verify-activation-${descriptor.key}`,
      label: `Verify ${descriptor.symbol} activation`,
      run: async (ctx) => {
        if (!await isGaugeActive(ctx, descriptor)) {
          throw new Error(`${descriptor.symbol} gauge activation could not be confirmed.`);
        }
        return "skip";
      },
    },
  ];
}

export function makeId20GaugeClaimStep(
  position: Id20GaugePosition,
  receiver: Address,
  displayLabelBtn = false,
) {
  const step = makeAddressWriteStep({
    key: `id20-gauge-claim-${position.key}`,
    label: `Claim ${position.symbol}`,
    displayLabelBtn,
    address: position.gaugeAddress,
    abi: position.gaugeAbi,
    variables: { functionName: "claim", args: [receiver] },
  } as never) as unknown as TxPreparedWriteStep;
  step.portfolioDomains = ["wallet", "id20", "rewards", "liquidity"];
  return step;
}

/**
 * Max ID20 that can be unwrapped/burned without settling credit first.
 * Active: weight. Inactive: untracked balance (balance − credit).
 */
export function id20BurnableWithoutSettlement(
  position: Pick<Id20GaugePosition, "isActive" | "weightRaw" | "creditRaw" | "balanceRaw">,
): bigint {
  if (position.isActive) return position.weightRaw;
  return position.balanceRaw > position.creditRaw
    ? position.balanceRaw - position.creditRaw
    : 0n;
}

/** True when `amount` exceeds burnable units and credit must be settled (and possibly activated) first. */
export function id20ExitNeedsCreditSettlement(
  position: Pick<Id20GaugePosition, "isActive" | "weightRaw" | "creditRaw" | "balanceRaw">,
  amount: bigint,
): boolean {
  if (amount <= 0n) return false;
  if (position.creditRaw <= 0n) return false;
  return amount > id20BurnableWithoutSettlement(position);
}

/** Inactive holders must activate before credit can be settled into weight. */
export function id20ExitNeedsActivation(
  position: Pick<Id20GaugePosition, "isActive" | "weightRaw" | "creditRaw" | "balanceRaw">,
  amount: bigint,
): boolean {
  if (position.isActive) return false;
  return id20ExitNeedsCreditSettlement(position, amount);
}

async function readAccountMetadata(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account">,
  position: Id20GaugePosition,
): Promise<GaugeMetadata | null> {
  const raw = await ctx.publicClient.readContract({
    address: position.gaugeAddress,
    abi: position.gaugeAbi,
    functionName: "accountMetadata",
    args: [ctx.account],
  } as never);
  return readGaugeMetadata(raw);
}

async function readId20Balance(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account">,
  position: Id20GaugePosition,
): Promise<bigint> {
  return ctx.publicClient.readContract({
    address: position.id20Address,
    abi: position.id20Abi,
    functionName: "balanceOf",
    args: [ctx.account],
  } as never) as Promise<bigint>;
}

function burnableFromMetadata(metadata: GaugeMetadata, balance: bigint): bigint {
  if (metadata.isActive) return metadata.weight;
  return balance > metadata.credit ? balance - metadata.credit : 0n;
}

async function collectCreditIssuedPairs(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account" | "chainId">,
  position: Id20GaugePosition,
): Promise<{ lender: Address; borrower: Address }[]> {
  const latest = await ctx.publicClient.getBlockNumber();
  const gaugeContractName =
    ID20_CONTRACTS.find((item) => item.key === position.key)?.gaugeName ?? "avBTCmGauge";
  const deployment = getContractDeploymentBlock(ctx.chainId, gaugeContractName) ?? 0;
  const fromBlock = deployment > 0 ? BigInt(deployment) : 0n;

  const pairs = new Map<string, { lender: Address; borrower: Address }>();

  const appendLogs = (logs: readonly { args?: unknown }[]) => {
    for (const log of logs) {
      if (!log.args || typeof log.args !== "object" || Array.isArray(log.args)) continue;
      const args = log.args as { lender?: Address; borrower?: Address };
      if (!args.lender || !args.borrower) continue;
      const lender = args.lender;
      const borrower = args.borrower;
      const key = `${lender.toLowerCase()}:${borrower.toLowerCase()}`;
      pairs.set(key, { lender, borrower });
    }
  };

  // Loans are recorded as CreditIssued(lender=receiver, borrower=sender).
  for (let start = fromBlock; start <= latest; start += CREDIT_ISSUED_LOG_CHUNK) {
    const end =
      start + CREDIT_ISSUED_LOG_CHUNK - 1n > latest ? latest : start + CREDIT_ISSUED_LOG_CHUNK - 1n;
    const [asLender, asBorrower] = await Promise.all([
      ctx.publicClient.getLogs({
        address: position.gaugeAddress,
        event: creditIssuedEvent,
        args: { lender: ctx.account },
        fromBlock: start,
        toBlock: end,
      }),
      ctx.publicClient.getLogs({
        address: position.gaugeAddress,
        event: creditIssuedEvent,
        args: { borrower: ctx.account },
        fromBlock: start,
        toBlock: end,
      }),
    ]);
    appendLogs(asLender);
    appendLogs(asBorrower);
  }

  return [...pairs.values()];
}

export type SettleableCreditPair = {
  lender: Address;
  borrower: Address;
  amount: bigint;
};

/** Find the next (lender, borrower) pair with positive maxSettleableCredit for the user. */
export async function findNextSettleableCreditPair(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account" | "chainId">,
  position: Id20GaugePosition,
): Promise<SettleableCreditPair | null> {
  const metadata = await readAccountMetadata(ctx, position);
  if (!metadata?.isActive || metadata.credit <= 0n) return null;

  const candidates = await collectCreditIssuedPairs(ctx, position);
  // Prefer pairs where the user is the lender (standard receive-from-active path).
  const ordered = [
    ...candidates.filter((pair) => pair.lender.toLowerCase() === ctx.account.toLowerCase()),
    ...candidates.filter((pair) => pair.lender.toLowerCase() !== ctx.account.toLowerCase()),
  ];

  for (const pair of ordered) {
    const amount = (await ctx.publicClient.readContract({
      address: position.gaugeAddress,
      abi: position.gaugeAbi,
      functionName: "maxSettleableCredit",
      args: [ctx.account, pair.lender, pair.borrower],
    } as never)) as bigint;
    if (amount > 0n) {
      return { lender: pair.lender, borrower: pair.borrower, amount };
    }
  }
  return null;
}

/**
 * One settleCredit write. Skips when burnable weight already covers `requiredAmount`
 * or when no settleable loan pair remains.
 */
export function makeId20SettleCreditStep(
  position: Id20GaugePosition,
  requiredAmount: bigint,
  index: number,
  displayLabelBtn = false,
): TxPreparedWriteStep {
  return {
    type: "write",
    key: `id20-settle-credit-${position.key}-${index}`,
    label: `Settle ${position.symbol} credit`,
    displayLabelBtn,
    portfolioDomains: ["id20", "rewards"],
    shouldSkip: async (ctx) => {
      const metadata = await readAccountMetadata(ctx, position);
      if (!metadata) return true;
      const balance = await readId20Balance(ctx, position);
      if (burnableFromMetadata(metadata, balance) >= requiredAmount) return true;
      if (metadata.credit <= 0n || !metadata.isActive) return true;
      const next = await findNextSettleableCreditPair(ctx, position);
      return next === null;
    },
    prepare: async (ctx) => {
      const next = await findNextSettleableCreditPair(ctx, position);
      if (!next) {
        throw new Error(
          `No settleable ${position.symbol} credit found. Settle outstanding credit before unwrapping.`,
        );
      }
      return {
        contract: { address: position.gaugeAddress, abi: position.gaugeAbi },
        request: {
          functionName: "settleCredit",
          args: [ctx.account, next.lender, next.borrower],
        },
      } as never;
    },
  };
}

/**
 * Prepend activation (if needed) + up to N settleCredit steps before ID20 unwrap/exit.
 * Call after claim, before unwrap so burn path has enough weight.
 */
export function makeId20CreditSettlementSteps(
  position: Id20GaugePosition,
  requiredAmount: bigint,
  options?: { displayLabelBtn?: boolean },
): TxStep[] {
  if (requiredAmount <= 0n) return [];
  if (!id20ExitNeedsCreditSettlement(position, requiredAmount)) return [];

  const displayLabelBtn = options?.displayLabelBtn ?? true;
  const steps: TxStep[] = [];

  if (id20ExitNeedsActivation(position, requiredAmount)) {
    steps.push(makeId20ActivationStep(position, displayLabelBtn));
  }

  for (let index = 0; index < MAX_CREDIT_SETTLE_STEPS; index += 1) {
    steps.push(makeId20SettleCreditStep(position, requiredAmount, index, displayLabelBtn));
  }

  // Final guard so a missing counterpart surface as a clear error instead of UnsettledCredit on unwrap.
  steps.push({
    type: "custom",
    key: `id20-verify-settlement-${position.key}`,
    label: `Verify ${position.symbol} credit settlement`,
    run: async (ctx) => {
      const metadata = await readAccountMetadata(ctx, position);
      if (!metadata) {
        throw new Error(`${position.symbol} gauge account metadata could not be loaded.`);
      }
      const balance = await readId20Balance(ctx, position);
      const burnable = burnableFromMetadata(metadata, balance);
      if (burnable < requiredAmount) {
        throw new Error(
          `Settle outstanding ${position.symbol} credit before unwrapping. ` +
            `Burnable ${burnable.toString()} is below requested ${requiredAmount.toString()}.`,
        );
      }
      return "skip";
    },
  });

  return steps;
}

export function useId20GaugePositions(chainId: number, account?: Address) {
  const id20Portfolio = useId20Portfolio();
  const descriptors = useMemo(() => getId20GaugeDescriptors(chainId), [chainId]);
  const sinkReads = useReadContracts({
    allowFailure: true,
    contracts: descriptors.map((descriptor) => ({
      address: descriptor.id20Address,
      abi: descriptor.id20Abi,
      functionName: "rewardSink",
      chainId,
    })),
    query: {
      enabled: descriptors.length > 0,
      ...staticReadQueryOptions,
    },
  });
  const gaugeAddresses = useMemo(
    () => descriptors.map((_, index) => readAddress(sinkReads.data?.[index]?.result)),
    [descriptors, sinkReads.data],
  );
  const metadataReads = useReadContracts({
    allowFailure: true,
    contracts: descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      return account && gaugeAddress ? [{
        address: gaugeAddress,
        abi: descriptor.gaugeAbi,
        functionName: "accountMetadata",
        args: [account],
        chainId,
      }] : [];
    }),
    query: {
      enabled: Boolean(account && gaugeAddresses.some(Boolean)),
      ...detailReadQueryOptions,
    },
  });

  const gauges = useMemo<Id20GaugePosition[]>(() => {
    let metadataIndex = 0;
    return descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      if (!account || !gaugeAddress) return [];
      const metadata = readGaugeMetadata(metadataReads.data?.[metadataIndex++]?.result);
      if (!metadata) return [];
      const balance = Object.values(id20Portfolio.data?.balances ?? {}).find(
        (item) => item.address.toLowerCase() === descriptor.id20Address.toLowerCase(),
      );
      const balanceRaw = balance?.rawBalance ?? 0n;
      return [{
        ...descriptor,
        symbol: balance?.symbol ?? descriptor.symbol,
        decimals: balance?.decimals ?? descriptor.decimals,
        gaugeAddress,
        balanceRaw,
        isActive: metadata.isActive,
        weightRaw: metadata.weight,
        debtRaw: metadata.debt,
        creditRaw: metadata.credit,
        lentRaw: metadata.lent,
        claimableRaw: metadata.accruedReward,
      }];
    });
  }, [account, descriptors, gaugeAddresses, id20Portfolio.data, metadataReads.data]);
  const positions = useMemo(
    () => gauges.filter((item) => item.balanceRaw > 0n || item.weightRaw > 0n || item.debtRaw > 0n ||
      item.creditRaw > 0n || item.lentRaw > 0n || item.claimableRaw > 0n),
    [gauges],
  );

  const refresh = useCallback(async () => {
    await Promise.all([sinkReads.refetch(), metadataReads.refetch(), id20Portfolio.refetch()]);
  }, [id20Portfolio, metadataReads, sinkReads]);

  return {
    gauges,
    positions,
    isLoading: sinkReads.isLoading || metadataReads.isLoading || id20Portfolio.isLoading,
    isFetching: sinkReads.isFetching || metadataReads.isFetching || id20Portfolio.isFetching,
    error: sinkReads.error || metadataReads.error || id20Portfolio.error,
    refresh,
  };
}
