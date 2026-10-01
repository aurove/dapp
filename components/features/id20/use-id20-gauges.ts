"use client";

import { useCallback, useMemo } from "react";
import { useReadContracts } from "wagmi";
import { parseAbiItem, type Abi, type Address, type Hex } from "viem";

import { getContractConfig, getContractDeploymentBlock } from "@/contracts/shared";
import { useId20Portfolio } from "@/features/portfolio";
import {
  makeAddressWriteStep,
  type TxFlowRuntimeContext,
  type TxPreparedWriteStep,
  type TxStep,
} from "@/lib/tx-flow";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { getEventLogsFromCacheOrFetch, type CachedEventLog } from "@/lib/web3/event-cache";

const ID20_CONTRACTS = [
  { key: "avBTCm", id20Name: "avBTCmId20", gaugeName: "avBTCmGauge" },
  { key: "avMEZOm", id20Name: "avMEZOmId20", gaugeName: "avMEZOmGauge" },
] as const;

/**
 * Mezo public RPCs enforce a small eth_getLogs window
 * (`maximum [from, to] blocks distance: 10000`). Stay at/under that limit.
 */
const CREDIT_ISSUED_LOG_CHUNK = 10_000n;
const CREDIT_READ_CONCURRENCY = 32;

const creditIssuedEvent = parseAbiItem(
  "event CreditIssued(address indexed lender, address indexed borrower, uint256 amount)",
);

type CreditPair = { lender: Address; borrower: Address; firstSeenBlock: bigint };

export type SettleableCreditPair = {
  lender: Address;
  borrower: Address;
  amount: bigint;
};

type CreditSettlementPlan = {
  enough: boolean;
  pairs: SettleableCreditPair[];
  capacity: bigint;
  target: bigint;
};

type RawCreditIssuedLog = {
  address: Address;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex?: number;
  args?: unknown;
};

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
  isActivated: boolean;
  settledUnitsRaw: bigint;
  rewardWeightRaw: bigint;
  debtWeightRaw: bigint;
  unsettledCreditRaw: bigint;
  lentWeightRaw: bigint;
  claimableRewardRaw: bigint;
};

type GaugeAccountState = {
  isActivated: boolean;
  settledUnits: bigint;
  rewardWeight: bigint;
  debtWeight: bigint;
  unsettledCredit: bigint;
  lentWeight: bigint;
  claimableReward: bigint;
};

function readAddress(value: unknown): Address | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : null;
}

function readGaugeAccountState(value: unknown): GaugeAccountState | null {
  if (Array.isArray(value)) {
    const [
      isActivated,
      settledUnits,
      rewardWeight,
      debtWeight,
      unsettledCredit,
      lentWeight,
      claimableReward,
    ] = value;
    if (
      typeof isActivated !== "boolean" ||
      ![settledUnits, rewardWeight, debtWeight, unsettledCredit, lentWeight, claimableReward].every(
        (item) => typeof item === "bigint",
      )
    )
      return null;
    return {
      isActivated,
      settledUnits,
      rewardWeight,
      debtWeight,
      unsettledCredit,
      lentWeight,
      claimableReward,
    };
  }

  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (
    typeof state.isActivated !== "boolean" ||
    ![
      state.settledUnits,
      state.rewardWeight,
      state.debtWeight,
      state.unsettledCredit,
      state.lentWeight,
      state.claimableReward,
    ].every((item) => typeof item === "bigint")
  )
    return null;
  return {
    isActivated: state.isActivated,
    settledUnits: state.settledUnits as bigint,
    rewardWeight: state.rewardWeight as bigint,
    debtWeight: state.debtWeight as bigint,
    unsettledCredit: state.unsettledCredit as bigint,
    lentWeight: state.lentWeight as bigint,
    claimableReward: state.claimableReward as bigint,
  };
}

export function getId20GaugeDescriptors(chainId: number): Id20GaugeDescriptor[] {
  return ID20_CONTRACTS.flatMap(({ key, id20Name, gaugeName }) => {
    const id20 = getContractConfig(chainId, id20Name);
    const gauge = getContractConfig(chainId, gaugeName);
    if (!id20?.address || !id20.abi || !gauge?.abi) return [];
    return [
      {
        key,
        id20Address: id20.address,
        id20Abi: id20.abi as Abi,
        gaugeAbi: gauge.abi as Abi,
        symbol: key,
        decimals: 18,
      },
    ];
  });
}

export function getLiquidityId20GaugeDescriptors(
  chainId: number,
  tokenAddresses: readonly (Address | null | undefined)[],
) {
  const tokens = new Set(tokenAddresses.filter(Boolean).map((address) => address!.toLowerCase()));
  return getId20GaugeDescriptors(chainId).filter((item) =>
    tokens.has(item.id20Address.toLowerCase()),
  );
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

async function isGaugeActivated(ctx: TxFlowRuntimeContext, descriptor: Id20GaugeDescriptor) {
  const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
  const accountState = await ctx.publicClient.readContract({
    address: gaugeAddress,
    abi: descriptor.gaugeAbi,
    functionName: "accountState",
    args: [ctx.account],
  } as never);
  return readGaugeAccountState(accountState)?.isActivated === true;
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
    shouldSkip: (ctx) => isGaugeActivated(ctx, descriptor),
    prepare: async (ctx) => {
      const gaugeAddress = await resolveGaugeAddress(ctx, descriptor);
      return {
        contract: { address: gaugeAddress, abi: descriptor.gaugeAbi },
        request: { functionName: "activate", args: [] },
      } as never;
    },
  };
}

export function makeId20ActivationGuardSteps(descriptor: Id20GaugeDescriptor): TxStep[] {
  return [
    makeId20ActivationStep(descriptor, true),
    {
      type: "custom",
      key: `id20-verify-activation-${descriptor.key}`,
      label: `Verify ${descriptor.symbol} activation`,
      run: async (ctx) => {
        if (!(await isGaugeActivated(ctx, descriptor))) {
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
 * Activated: settled units. Non-activated: untracked balance (balance − credit).
 */
export function id20BurnableWithoutSettlement(
  position: Pick<
    Id20GaugePosition,
    "isActivated" | "settledUnitsRaw" | "unsettledCreditRaw" | "balanceRaw"
  >,
): bigint {
  if (position.isActivated) return position.settledUnitsRaw;
  return position.balanceRaw > position.unsettledCreditRaw
    ? position.balanceRaw - position.unsettledCreditRaw
    : 0n;
}

/** True when `amount` exceeds burnable units and credit must be settled (and possibly activated) first. */
export function id20ExitNeedsCreditSettlement(
  position: Pick<
    Id20GaugePosition,
    "isActivated" | "settledUnitsRaw" | "unsettledCreditRaw" | "balanceRaw"
  >,
  amount: bigint,
): boolean {
  if (amount <= 0n) return false;
  if (position.unsettledCreditRaw <= 0n) return false;
  return amount > id20BurnableWithoutSettlement(position);
}

/** Inactive holders must activate before credit can be settled into weight. */
export function id20ExitNeedsActivation(
  position: Pick<
    Id20GaugePosition,
    "isActivated" | "settledUnitsRaw" | "unsettledCreditRaw" | "balanceRaw"
  >,
  amount: bigint,
): boolean {
  if (position.isActivated) return false;
  return id20ExitNeedsCreditSettlement(position, amount);
}

async function readAccountState(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account">,
  position: Id20GaugePosition,
): Promise<GaugeAccountState | null> {
  const raw = await ctx.publicClient.readContract({
    address: position.gaugeAddress,
    abi: position.gaugeAbi,
    functionName: "accountState",
    args: [ctx.account],
  } as never);
  return readGaugeAccountState(raw);
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

function burnableFromAccountState(accountState: GaugeAccountState, balance: bigint): bigint {
  if (accountState.isActivated) return accountState.settledUnits;
  return balance > accountState.unsettledCredit ? balance - accountState.unsettledCredit : 0n;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await fn(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function isLogRangeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("blocks distance") ||
    message.includes("block range") ||
    message.includes("eth_getLogs")
  );
}

function appendCreditIssuedLogs(
  pairs: Map<string, CreditPair>,
  logs: readonly CachedEventLog[],
): void {
  for (const log of logs) {
    const lender = log.args.lender;
    const borrower = log.args.borrower;
    if (typeof lender !== "string" || typeof borrower !== "string") continue;
    const key = `${lender.toLowerCase()}:${borrower.toLowerCase()}`;
    const blockNumber = log.blockNumber;
    const existing = pairs.get(key);
    if (!existing || blockNumber > existing.firstSeenBlock) {
      pairs.set(key, {
        lender: lender as Address,
        borrower: borrower as Address,
        firstSeenBlock: blockNumber,
      });
    }
  }
}

async function readCreditIssuedChunk(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "chainId">,
  position: Id20GaugePosition,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<CachedEventLog[]> {
  const blockHashes = new Map<string, Hex | null>();
  const getBlockHash = async (blockNumber: bigint): Promise<Hex | null> => {
    const key = blockNumber.toString();
    if (blockHashes.has(key)) return blockHashes.get(key) ?? null;
    const block = await ctx.publicClient.getBlock({ blockNumber });
    const hash = block.hash ?? null;
    blockHashes.set(key, hash);
    return hash;
  };

  return getEventLogsFromCacheOrFetch({
    chainId: ctx.chainId,
    contractAddress: position.gaugeAddress,
    eventName: "CreditIssued",
    fromBlock,
    toBlock,
    getBlockHash,
    fetchRange: async (rangeFrom, rangeTo) => {
      const logs = await ctx.publicClient.getLogs({
        address: position.gaugeAddress,
        event: creditIssuedEvent,
        fromBlock: rangeFrom,
        toBlock: rangeTo,
      });
      return (logs as readonly RawCreditIssuedLog[]).flatMap((log) => {
        if (log.blockNumber === undefined || !log.transactionHash) return [];
        return [
          {
            address: log.address,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex ?? 0,
            args: (log.args ?? {}) as Record<string, unknown>,
          },
        ];
      });
    },
  });
}

async function evaluateCreditSettlementPlan(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account">,
  position: Id20GaugePosition,
  pairs: readonly CreditPair[],
  target: bigint,
): Promise<CreditSettlementPlan> {
  if (target <= 0n) return { enough: true, pairs: [], capacity: 0n, target: 0n };

  const amounts = await mapWithConcurrency(
    pairs,
    CREDIT_READ_CONCURRENCY,
    (pair) =>
      ctx.publicClient.readContract({
        address: position.gaugeAddress,
        abi: position.gaugeAbi,
        functionName: "maxSettleableCredit",
        args: [ctx.account, pair.lender, pair.borrower],
      } as never) as Promise<bigint>,
  );
  const positive = pairs.flatMap((pair, index) => {
    const amount = amounts[index]!;
    return amount > 0n ? [{ lender: pair.lender, borrower: pair.borrower, amount }] : [];
  });
  if (positive.length === 0) return { enough: false, pairs: [], capacity: 0n, target };

  const lenders = [...new Set(positive.map((pair) => pair.lender.toLowerCase()))];
  const lenderStates = await mapWithConcurrency(
    lenders,
    CREDIT_READ_CONCURRENCY,
    (lender) =>
      ctx.publicClient.readContract({
        address: position.gaugeAddress,
        abi: position.gaugeAbi,
        functionName: "accountState",
        args: [lender as Address],
      } as never) as Promise<unknown>,
  );
  const budgets = new Map<string, bigint>();
  for (let index = 0; index < lenders.length; index += 1) {
    const state = readGaugeAccountState(lenderStates[index]);
    const lender = lenders[index]!;
    const deficiency =
      state && state.lentWeight > state.unsettledCredit
        ? state.lentWeight - state.unsettledCredit
        : 0n;
    budgets.set(
      lender,
      lender === ctx.account.toLowerCase() ? (state?.lentWeight ?? 0n) : deficiency,
    );
  }

  const ordered = [...positive].sort((left, right) => {
    if (left.amount !== right.amount) return left.amount > right.amount ? -1 : 1;
    if (left.lender.toLowerCase() === ctx.account.toLowerCase()) return -1;
    if (right.lender.toLowerCase() === ctx.account.toLowerCase()) return 1;
    return `${left.lender}:${left.borrower}`.localeCompare(`${right.lender}:${right.borrower}`);
  });
  let remaining = target;
  let capacity = 0n;
  const selected: SettleableCreditPair[] = [];
  for (const pair of ordered) {
    if (remaining === 0n) break;
    const lender = pair.lender.toLowerCase();
    const budget = budgets.get(lender) ?? 0n;
    const amount = [pair.amount, budget, remaining].reduce((smallest, value) =>
      value < smallest ? value : smallest,
    );
    if (amount === 0n) continue;
    selected.push({ ...pair, amount });
    capacity += amount;
    remaining -= amount;
    budgets.set(lender, budget - amount);
  }
  return { enough: capacity >= target, pairs: selected, capacity, target };
}

async function discoverCreditSettlementPlan(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account" | "chainId">,
  position: Id20GaugePosition,
  requiredAmount: bigint,
): Promise<CreditSettlementPlan> {
  const accountState = await readAccountState(ctx, position);
  if (!accountState || !accountState.isActivated || accountState.unsettledCredit <= 0n) {
    return { enough: false, pairs: [], capacity: 0n, target: requiredAmount };
  }
  const balance = await readId20Balance(ctx, position);
  const burnable = burnableFromAccountState(accountState, balance);
  const target = requiredAmount > burnable ? requiredAmount - burnable : 0n;
  if (target === 0n) return { enough: true, pairs: [], capacity: 0n, target: 0n };

  const latest = await ctx.publicClient.getBlockNumber();
  const gaugeContractName =
    ID20_CONTRACTS.find((item) => item.key === position.key)?.gaugeName ?? "avBTCmGauge";
  const deployment = getContractDeploymentBlock(ctx.chainId, gaugeContractName) ?? 0;
  const fromBlock = deployment > 0 ? BigInt(deployment) : 0n;
  const pairs = new Map<string, CreditPair>();
  let toBlock = latest;
  let chunkSize = CREDIT_ISSUED_LOG_CHUNK;

  while (toBlock >= fromBlock) {
    const start = toBlock >= chunkSize - 1n ? toBlock - chunkSize + 1n : 0n;
    const chunkFrom = start < fromBlock ? fromBlock : start;
    try {
      const logs = await readCreditIssuedChunk(ctx, position, chunkFrom, toBlock);
      appendCreditIssuedLogs(pairs, logs);
      const plan = await evaluateCreditSettlementPlan(ctx, position, [...pairs.values()], target);
      if (plan.enough) return plan;
      if (chunkFrom === fromBlock) return plan;
      toBlock = chunkFrom - 1n;
    } catch (error) {
      if (!isLogRangeError(error) || chunkSize <= 1n) throw error;
      chunkSize = chunkSize / 2n;
    }
  }
  return evaluateCreditSettlementPlan(ctx, position, [...pairs.values()], target);
}

/** Find the next (lender, borrower) pair with positive maxSettleableCredit for the user. */
export async function findNextSettleableCreditPair(
  ctx: Pick<TxFlowRuntimeContext, "publicClient" | "account" | "chainId">,
  position: Id20GaugePosition,
  requiredAmount = position.balanceRaw,
): Promise<SettleableCreditPair | null> {
  const plan = await discoverCreditSettlementPlan(ctx, position, requiredAmount);
  return plan.pairs[0] ?? null;
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
  // Share one discovery result between shouldSkip and prepare for this step.
  let resolvedPair: SettleableCreditPair | null | undefined;

  return {
    type: "write",
    key: `id20-settle-credit-${position.key}-${index}`,
    label: `Settle ${position.symbol} credit`,
    displayLabelBtn,
    portfolioDomains: ["id20", "rewards"],
    shouldSkip: async (ctx) => {
      resolvedPair = undefined;
      const accountState = await readAccountState(ctx, position);
      if (!accountState) return true;
      const balance = await readId20Balance(ctx, position);
      if (burnableFromAccountState(accountState, balance) >= requiredAmount) return true;
      if (accountState.unsettledCredit <= 0n || !accountState.isActivated) return true;
      resolvedPair = await findNextSettleableCreditPair(ctx, position, requiredAmount);
      return resolvedPair === null;
    },
    prepare: async (ctx) => {
      const next =
        resolvedPair !== undefined
          ? resolvedPair
          : await findNextSettleableCreditPair(ctx, position, requiredAmount);
      resolvedPair = undefined;
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

function makeId20SettleCreditsBatchStep(
  position: Id20GaugePosition,
  requiredAmount: bigint,
  planRef: { pairs: SettleableCreditPair[] },
  displayLabelBtn: boolean,
): TxPreparedWriteStep {
  return {
    type: "write",
    key: `id20-settle-credits-${position.key}`,
    label: `Settle ${position.symbol} credit`,
    displayLabelBtn,
    portfolioDomains: ["id20", "rewards"],
    shouldSkip: async (ctx) => {
      const accountState = await readAccountState(ctx, position);
      if (!accountState) return true;
      const balance = await readId20Balance(ctx, position);
      if (burnableFromAccountState(accountState, balance) >= requiredAmount) return true;
      if (planRef.pairs.length === 0) {
        throw new Error(`No complete ${position.symbol} credit settlement plan was discovered.`);
      }
      return false;
    },
    prepare: async (ctx) => {
      if (planRef.pairs.length === 0) {
        throw new Error(`No complete ${position.symbol} credit settlement plan was discovered.`);
      }
      return {
        contract: { address: position.gaugeAddress, abi: position.gaugeAbi },
        request: {
          functionName: "settleCredits",
          args: [
            planRef.pairs.map(({ lender, borrower }) => ({
              account: ctx.account,
              lender,
              borrower,
            })),
          ],
        },
      } as never;
    },
  };
}

/**
 * Prepend activation (if needed), discover a complete settlement plan, and settle it in one
 * atomic batch before ID20 unwrap/exit. Discovery is read-only and runs before the batch write.
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
  const planRef: { pairs: SettleableCreditPair[] } = { pairs: [] };

  if (id20ExitNeedsActivation(position, requiredAmount)) {
    steps.push(makeId20ActivationStep(position, displayLabelBtn));
  }

  steps.push({
    type: "custom",
    key: `id20-discover-settlement-${position.key}`,
    label: `Find ${position.symbol} credit borrowers`,
    displayLabelBtn,
    run: async (ctx) => {
      const plan = await discoverCreditSettlementPlan(ctx, position, requiredAmount);
      if (!plan.enough) {
        throw new Error(
          `Only ${plan.capacity.toString()} of required ${plan.target.toString()} ${position.symbol} ` +
            "credit is currently covered by discovered borrowers.",
        );
      }
      planRef.pairs = plan.pairs;
      return "skip";
    },
  });
  steps.push(makeId20SettleCreditsBatchStep(position, requiredAmount, planRef, displayLabelBtn));

  // Final guard so a missing counterpart surface as a clear error instead of UnsettledCredit on unwrap.
  steps.push({
    type: "custom",
    key: `id20-verify-settlement-${position.key}`,
    label: `Verify ${position.symbol} credit settlement`,
    run: async (ctx) => {
      const accountState = await readAccountState(ctx, position);
      if (!accountState) {
        throw new Error(`${position.symbol} gauge account state could not be loaded.`);
      }
      const balance = await readId20Balance(ctx, position);
      const burnable = burnableFromAccountState(accountState, balance);
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
  const accountStateReads = useReadContracts({
    allowFailure: true,
    contracts: descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      return account && gaugeAddress
        ? [
            {
              address: gaugeAddress,
              abi: descriptor.gaugeAbi,
              functionName: "accountState",
              args: [account],
              chainId,
            },
          ]
        : [];
    }),
    query: {
      enabled: Boolean(account && gaugeAddresses.some(Boolean)),
      ...detailReadQueryOptions,
    },
  });

  const gauges = useMemo<Id20GaugePosition[]>(() => {
    let accountStateIndex = 0;
    return descriptors.flatMap((descriptor, index) => {
      const gaugeAddress = gaugeAddresses[index];
      if (!account || !gaugeAddress) return [];
      const accountState = readGaugeAccountState(
        accountStateReads.data?.[accountStateIndex++]?.result,
      );
      if (!accountState) return [];
      const balance = Object.values(id20Portfolio.data?.balances ?? {}).find(
        (item) => item.address.toLowerCase() === descriptor.id20Address.toLowerCase(),
      );
      const balanceRaw = balance?.rawBalance ?? 0n;
      return [
        {
          ...descriptor,
          symbol: balance?.symbol ?? descriptor.symbol,
          decimals: balance?.decimals ?? descriptor.decimals,
          gaugeAddress,
          balanceRaw,
          isActivated: accountState.isActivated,
          settledUnitsRaw: accountState.settledUnits,
          rewardWeightRaw: accountState.rewardWeight,
          debtWeightRaw: accountState.debtWeight,
          unsettledCreditRaw: accountState.unsettledCredit,
          lentWeightRaw: accountState.lentWeight,
          claimableRewardRaw: accountState.claimableReward,
        },
      ];
    });
  }, [account, descriptors, gaugeAddresses, id20Portfolio.data, accountStateReads.data]);
  const positions = useMemo(
    () =>
      gauges.filter(
        (item) =>
          item.balanceRaw > 0n ||
          item.rewardWeightRaw > 0n ||
          item.debtWeightRaw > 0n ||
          item.unsettledCreditRaw > 0n ||
          item.lentWeightRaw > 0n ||
          item.claimableRewardRaw > 0n,
      ),
    [gauges],
  );

  const refresh = useCallback(async () => {
    await Promise.all([sinkReads.refetch(), accountStateReads.refetch(), id20Portfolio.refetch()]);
  }, [id20Portfolio, accountStateReads, sinkReads]);

  return {
    gauges,
    positions,
    isLoading: sinkReads.isLoading || accountStateReads.isLoading || id20Portfolio.isLoading,
    isFetching: sinkReads.isFetching || accountStateReads.isFetching || id20Portfolio.isFetching,
    error: sinkReads.error || accountStateReads.error || id20Portfolio.error,
    refresh,
  };
}
