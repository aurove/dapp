import { Abi } from "abitype";

import { normalizeFunctionArgs } from "./abi";
import type { TxFlowRuntimeContext } from "./context";
import { getParsedError } from "./getParsedError";
import type { TxPreparedWriteStep, TxStepResult, TxWriteCall, TxWriteFunctionName } from "./types";

export const ctxPrevResultsStore = new WeakMap<object, TxStepResult[]>();

export function bindStepResultsStore(ctx: object, results: TxStepResult[]) {
  ctxPrevResultsStore.set(ctx, results);
}

export function getPrevStepResults(ctx: object): TxStepResult[] {
  return ctxPrevResultsStore.get(ctx) ?? [];
}

async function simulateWriteCall<TAbi extends Abi, TFunctionName extends TxWriteFunctionName<TAbi>>(
  ctx: TxFlowRuntimeContext,
  call: TxWriteCall<TAbi, TFunctionName>,
) {
  const { contract, request } = call;
  const { functionName, args: namedArgs, ...otherVars } = request;

  const args = normalizeFunctionArgs(contract.abi, functionName, namedArgs);

  return ctx.publicClient.simulateContract({
    account: ctx.account,
    abi: contract.abi,
    address: contract.address,
    functionName,
    args,
    ...(otherVars as Record<string, unknown>),
  } as Parameters<TxFlowRuntimeContext["publicClient"]["simulateContract"]>[0]);
}

export async function executePreparedWriteStep(
  step: TxPreparedWriteStep,
  ctx: TxFlowRuntimeContext,
) {
  if (step.shouldSkip) {
    const skip = await step.shouldSkip(ctx);
    if (skip) return "skip" as const;
  }

  const notifyId = ctx.notify?.pendingTx(step.label, "Waiting for wallet confirmation…", {
    chainId: ctx.chainId,
  });

  try {
    const call = await step.prepare(ctx, getPrevStepResults(ctx));
    const simulation = await simulateWriteCall(ctx, call);

    step.onSimulated?.(
      simulation as Awaited<ReturnType<TxFlowRuntimeContext["publicClient"]["simulateContract"]>>,
    );

    if (notifyId) {
      ctx.notify?.update(notifyId, { message: "Confirm in wallet…" });
    }

    const hash = (await ctx.writeAsync(
      simulation.request as Parameters<TxFlowRuntimeContext["writeAsync"]>[0],
    )) as `0x${string}`;
    if (notifyId) {
      ctx.notify?.txSent(notifyId, hash);
    }

    const receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: call.confirmations ?? 1,
    });

    if (notifyId) {
      ctx.notify?.txConfirmed(notifyId);
    }
    return { hash, receipt };
  } catch (error) {
    if (notifyId) {
      ctx.notify?.txFailed(notifyId, getParsedError(error));
    }
    throw error;
  }
}
