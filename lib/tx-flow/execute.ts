import { normalizeFunctionArgs } from "@/contracts/types";
import { getParsedError } from "./getParsedError";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import type { TxFlowRuntimeContext, TxPreparedWriteStep, TxStepResult } from "./types";

export const ctxPrevResultsStore = new WeakMap<object, TxStepResult[]>();

export function bindStepResultsStore(ctx: object, results: TxStepResult[]) {
  ctxPrevResultsStore.set(ctx, results);
}

export function getPrevStepResults(ctx: object): TxStepResult[] {
  return ctxPrevResultsStore.get(ctx) ?? [];
}

export async function executePreparedWriteStep(
  step: TxPreparedWriteStep,
  ctx: TxFlowRuntimeContext,
) {
  if (step.shouldSkip) {
    const skip = await step.shouldSkip(ctx);
    if (skip) return "skip" as const;
  }

  const lifecycle = createTxNotificationLifecycle(step.label);
  const meta = await lifecycle.onPending?.({ key: step.key, label: step.label, ctx });

  try {
    const call = await step.prepare(ctx, getPrevStepResults(ctx));

    if (lifecycle.onAwaitingWalletConfirmation) {
      await lifecycle.onAwaitingWalletConfirmation({ key: step.key, label: step.label, ctx, meta });
    }

    const { contract, request } = call;
    const { functionName, args: namedArgs, ...otherVars } = request;
    const args = normalizeFunctionArgs(contract.abi, functionName, namedArgs);

    const hash = (await ctx.writeAsync({
      ...otherVars,
      abi: contract.abi,
      address: contract.address,
      args,
      functionName,
      chainId: ctx.chainId,
    } as Parameters<TxFlowRuntimeContext["writeAsync"]>[0])) as `0x${string}`;
    if (lifecycle.onTransactionSubmitted) {
      await lifecycle.onTransactionSubmitted({ key: step.key, label: step.label, ctx, hash, meta });
    }

    const receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: call.confirmations ?? 1,
    });

    if (lifecycle.onTransactionConfirmed) {
      await lifecycle.onTransactionConfirmed({
        key: step.key,
        label: step.label,
        ctx,
        hash,
        receipt,
        meta,
      });
    }
    return { hash, receipt };
  } catch (error) {
    if (lifecycle.onTransactionFailed) {
      await lifecycle.onTransactionFailed({
        key: step.key,
        label: step.label,
        ctx,
        error,
        message: getParsedError(error),
        meta,
      });
    }
    throw error;
  }
}
