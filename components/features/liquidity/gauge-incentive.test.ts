import assert from "node:assert/strict";
import test from "node:test";
import type { Address, PublicClient } from "viem";

import { getContractsByChainId } from "@/contracts/shared";
import {
  AUROVE_LIQUIDITY_PAIRS,
  resolveAuroveLiquidityPairRoute,
  resolveGaugeIncentiveTarget,
  resolveGaugeIncentiveTargetFromContracts,
} from "@/lib/config/supported-liquidity-pools";
import {
  deriveGaugeIncentiveEpoch,
  gaugeIncentiveKeys,
  MEZO_INCENTIVE_EPOCH_SECONDS,
  normalizeGaugeIncentiveError,
  validateGaugeIncentiveInput,
} from "./gauge-incentive-model";
import { filterAcceptedGaugeIncentiveTokens } from "./use-gauge-incentive-data";
import {
  buildGaugeIncentiveApprovalStep,
  buildGaugeIncentiveSubmissionStep,
  invalidateGaugeIncentiveQueries,
} from "./gauge-incentive-transactions";
import { executePreparedWriteStep } from "@/lib/tx-flow/execute";
import type { TxFlowRuntimeContext, TxPreparedWriteStep } from "@/lib/tx-flow/types";

const TOKEN_A = "0x0000000000000000000000000000000000000001" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000000002" as Address;
const TOKEN_C = "0x0000000000000000000000000000000000000003" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000000004" as Address;
const TX_HASH = `0x${"ab".repeat(32)}` as const;

function makeExecutionContext(params?: { simulationError?: Error; walletError?: Error }) {
  const simulatedCalls: unknown[] = [];
  const writtenRequests: unknown[] = [];
  const receipt = { status: "success", transactionHash: TX_HASH };
  const publicClient = {
    simulateContract: async (request: unknown) => {
      if (params?.simulationError) throw params.simulationError;
      simulatedCalls.push(request);
      return { request };
    },
    waitForTransactionReceipt: async () => receipt,
  };
  const ctx = {
    account: ACCOUNT,
    chainId: 999_999,
    publicClient,
    writeAsync: async (request: unknown) => {
      if (params?.walletError) throw params.walletError;
      writtenRequests.push(request);
      return TX_HASH;
    },
    contracts: {},
    queryClient: { invalidateQueries: async () => undefined },
  } as unknown as TxFlowRuntimeContext;

  return { ctx, receipt, simulatedCalls, writtenRequests };
}

test("every shared pair route resolves to its pair-specific configuration", () => {
  assert.deepEqual(
    AUROVE_LIQUIDITY_PAIRS.map((pair) => pair.routeSlug),
    ["btc", "mezo"],
  );
  for (const pair of AUROVE_LIQUIDITY_PAIRS) {
    assert.equal(resolveAuroveLiquidityPairRoute(pair.routeSlug)?.key, pair.key);
    assert.equal(resolveAuroveLiquidityPairRoute(pair.routeSlug.toUpperCase())?.key, pair.key);
  }
  assert.equal(resolveAuroveLiquidityPairRoute("unknown"), null);
});

test("testnet pair routes bind to the exact deployed pool, gauge, voter, and bribe", () => {
  const contracts = getContractsByChainId(31611) as unknown as Record<
    string,
    { address?: string; linkedData?: Readonly<Record<string, unknown>> }
  >;

  for (const pair of AUROVE_LIQUIDITY_PAIRS) {
    const resolution = resolveGaugeIncentiveTarget(31611, pair.key);
    assert.equal(resolution.available, true);
    if (!resolution.available) continue;

    const pool = contracts[pair.poolContractName];
    const gauge = contracts[pair.gaugeContractName];
    assert.equal(resolution.target.poolAddress, pool?.address);
    assert.equal(resolution.target.gaugeAddress, gauge?.address);
    assert.equal(resolution.target.voterAddress, gauge?.linkedData?.voter);
    assert.equal(resolution.target.incentiveRecipientAddress, gauge?.linkedData?.bribeVotingReward);
    assert.notEqual(
      resolution.target.gaugeAddress.toLowerCase(),
      resolution.target.incentiveRecipientAddress.toLowerCase(),
    );
  }
});

test("missing-gauge and unsupported-network configurations fail closed", () => {
  for (const pair of AUROVE_LIQUIDITY_PAIRS) {
    const configured = getContractsByChainId(31611) as unknown as Record<
      string,
      { address?: Address }
    >;
    const resolution = resolveGaugeIncentiveTargetFromContracts(
      { [pair.poolContractName]: configured[pair.poolContractName] },
      pair.key,
    );
    assert.equal(resolution.available, false);
    assert.match(resolution.reason, /gauge|network/i);
  }
  const unsupported = resolveGaugeIncentiveTarget(999_999, "BTC");
  assert.equal(unsupported.available, false);
  assert.match(unsupported.reason, /network/i);
});

test("Mezo incentive epochs use the canonical seven-day boundary", () => {
  const timestamp = MEZO_INCENTIVE_EPOCH_SECONDS * 42n + 12345n;
  const epoch = deriveGaugeIncentiveEpoch(timestamp);
  assert.equal(epoch.start, MEZO_INCENTIVE_EPOCH_SECONDS * 42n);
  assert.equal(epoch.closesAt, MEZO_INCENTIVE_EPOCH_SECONDS * 43n);
});

test("amount, balance, and allowance validation separates approval and submission paths", () => {
  const base = {
    decimals: 18,
    balance: 10n * 10n ** 18n,
    connected: true,
    tokenSupported: true,
    gaugeAvailable: true,
  };

  const approvalRequired = validateGaugeIncentiveInput({
    ...base,
    amount: "2",
    allowance: 1n * 10n ** 18n,
  });
  assert.equal(approvalRequired.error, null);
  assert.equal(approvalRequired.requiresApproval, true);
  assert.equal(approvalRequired.canApprove, true);
  assert.equal(approvalRequired.canIncentivise, false);

  const approvalNotRequired = validateGaugeIncentiveInput({
    ...base,
    amount: "2",
    allowance: 2n * 10n ** 18n,
  });
  assert.equal(approvalNotRequired.requiresApproval, false);
  assert.equal(approvalNotRequired.canApprove, false);
  assert.equal(approvalNotRequired.canIncentivise, true);

  assert.match(
    validateGaugeIncentiveInput({ ...base, amount: "11", allowance: 100n * 10n ** 18n }).error ??
      "",
    /balance/i,
  );
  assert.match(
    validateGaugeIncentiveInput({ ...base, amount: "nope", allowance: 0n }).error ?? "",
    /valid amount/i,
  );
  assert.match(
    validateGaugeIncentiveInput({
      ...base,
      amount: "1",
      allowance: 0n,
      tokenSupported: false,
    }).error ?? "",
    /accepted/i,
  );
});

test("supported-token filtering keeps existing rewards and newly whitelisted candidates only", async () => {
  const targetResolution = resolveGaugeIncentiveTarget(31611, "BTC");
  assert.equal(targetResolution.available, true);
  if (!targetResolution.available) return;

  const publicClient = {
    readContract: async (request: { functionName: string; args?: readonly unknown[] }) => {
      const token = String(request.args?.[0] ?? "").toLowerCase();
      if (request.functionName === "isReward") return false;
      if (request.functionName === "isWhitelistedToken") {
        return token === TOKEN_B.toLowerCase();
      }
      throw new Error(`Unexpected read ${request.functionName}`);
    },
  } as unknown as PublicClient;

  const filtered = await filterAcceptedGaugeIncentiveTokens({
    publicClient,
    target: targetResolution.target,
    discovered: [TOKEN_A],
    candidates: [TOKEN_A, TOKEN_B, TOKEN_C],
  });
  assert.deepEqual(filtered, [TOKEN_A, TOKEN_B]);
});

test("approval and successful incentive submission target distinct canonical contracts", async () => {
  const resolution = resolveGaugeIncentiveTarget(31611, "MEZO");
  assert.equal(resolution.available, true);
  if (!resolution.available) return;

  const ctx = {} as never;
  const approval = await buildGaugeIncentiveApprovalStep({
    target: resolution.target,
    tokenAddress: TOKEN_A,
    amount: 25n,
  }).prepare(ctx, []);
  const submission = await buildGaugeIncentiveSubmissionStep({
    target: resolution.target,
    tokenAddress: TOKEN_A,
    amount: 25n,
  }).prepare(ctx, []);

  assert.equal(approval.contract.address, TOKEN_A);
  assert.equal(approval.request.functionName, "approve");
  assert.deepEqual(approval.request.args, [resolution.target.incentiveRecipientAddress, 25n]);
  assert.equal(submission.contract.address, resolution.target.incentiveRecipientAddress);
  assert.notEqual(submission.contract.address, resolution.target.gaugeAddress);
  assert.equal(submission.request.functionName, "notifyRewardAmount");
  assert.deepEqual(submission.request.args, [TOKEN_A, 25n]);
});

test("successful incentive submission simulates, submits, and confirms the canonical bribe call", async () => {
  const resolution = resolveGaugeIncentiveTarget(31611, "BTC");
  assert.equal(resolution.available, true);
  if (!resolution.available) return;

  const execution = makeExecutionContext();
  const step = buildGaugeIncentiveSubmissionStep({
    target: resolution.target,
    tokenAddress: TOKEN_A,
    amount: 25n,
  }) as unknown as TxPreparedWriteStep;
  const result = await executePreparedWriteStep(step, execution.ctx);

  assert.notEqual(result, "skip");
  if (result === "skip") return;
  assert.equal(result.hash, TX_HASH);
  assert.equal(result.receipt, execution.receipt);
  assert.equal(execution.simulatedCalls.length, 1);
  assert.equal(execution.writtenRequests.length, 1);
  assert.equal(
    (execution.simulatedCalls[0] as { address: Address }).address,
    resolution.target.incentiveRecipientAddress,
  );
  assert.equal(
    (execution.simulatedCalls[0] as { functionName: string }).functionName,
    "notifyRewardAmount",
  );
});

test("submission surfaces wallet rejection and simulated contract reverts", async () => {
  const resolution = resolveGaugeIncentiveTarget(31611, "BTC");
  assert.equal(resolution.available, true);
  if (!resolution.available) return;
  const step = buildGaugeIncentiveSubmissionStep({
    target: resolution.target,
    tokenAddress: TOKEN_A,
    amount: 25n,
  }) as unknown as TxPreparedWriteStep;

  await assert.rejects(
    executePreparedWriteStep(
      step,
      makeExecutionContext({ walletError: new Error("User rejected the request") }).ctx,
    ),
    /rejected/i,
  );
  await assert.rejects(
    executePreparedWriteStep(
      step,
      makeExecutionContext({ simulationError: new Error("execution reverted: NotWhitelisted()") })
        .ctx,
    ),
    /reverted/i,
  );
});

test("wallet rejection and reverted incentive errors produce clear messages", () => {
  assert.equal(
    normalizeGaugeIncentiveError(new Error("User rejected the request (code 4001)")),
    "The transaction was rejected in your wallet.",
  );
  assert.equal(
    normalizeGaugeIncentiveError(new Error("execution reverted: NotWhitelisted()")),
    "That token is no longer accepted for gauge incentives.",
  );
  assert.equal(
    normalizeGaugeIncentiveError(new Error("GaugeNotAlive()")),
    "This gauge is currently inactive and cannot receive incentives.",
  );
});

test("post-transaction invalidation refreshes gauge data and wallet portfolio", async () => {
  const calls: readonly unknown[][] = [];
  const mutableCalls = calls as unknown[][];
  const queryClient = {
    invalidateQueries: async (filters: { queryKey?: readonly unknown[] }) => {
      mutableCalls.push([...(filters.queryKey ?? [])]);
    },
  };

  await invalidateGaugeIncentiveQueries(queryClient as never, {
    chainId: 31611,
    gaugeAddress: TOKEN_C,
    account: TOKEN_B,
    includePortfolio: true,
  });

  assert.deepEqual(mutableCalls[0], gaugeIncentiveKeys.gauge(31611, TOKEN_C));
  assert.deepEqual(mutableCalls[1], ["portfolio", 31611, TOKEN_B.toLowerCase()]);
});
