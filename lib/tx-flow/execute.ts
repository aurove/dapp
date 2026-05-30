import { normalizeFunctionArgs } from "@/contracts/types";
import { getParsedError } from "./getParsedError";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import type { ContractAbi } from "@/contracts/types";
import type {
  TxFlowRuntimeContext,
  TxPreparedWriteStep,
  TxStepResult,
  TxWriteCall,
  TxWriteFunctionName,
} from "./types";

export const ctxPrevResultsStore = new WeakMap<object, TxStepResult[]>();

export function bindStepResultsStore(ctx: object, results: TxStepResult[]) {
  ctxPrevResultsStore.set(ctx, results);
}

export function getPrevStepResults(ctx: object): TxStepResult[] {
  return ctxPrevResultsStore.get(ctx) ?? [];
}

async function simulateWriteCall<
  TAbi extends ContractAbi,
  TFunctionName extends TxWriteFunctionName<TAbi>,
>(ctx: TxFlowRuntimeContext, call: TxWriteCall<TAbi, TFunctionName>) {
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

  const lifecycle = createTxNotificationLifecycle(step.label);
  const meta = await lifecycle.onPending?.({ key: step.key, label: step.label, ctx });

  try {
    const call = await step.prepare(ctx, getPrevStepResults(ctx));
    const simulation = await simulateWriteCall(ctx, call);

    step.onSimulated?.(
      simulation as Awaited<ReturnType<TxFlowRuntimeContext["publicClient"]["simulateContract"]>>,
    );

    if (lifecycle.onAwaitingWalletConfirmation) {
      await lifecycle.onAwaitingWalletConfirmation({ key: step.key, label: step.label, ctx, meta });
    }

    const hash = (await ctx.writeAsync(
      simulation.request as Parameters<TxFlowRuntimeContext["writeAsync"]>[0],
    )) as `0x${string}`;
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
