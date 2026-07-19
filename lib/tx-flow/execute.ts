import { getParsedError } from "./getParsedError";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import type { AbiFunctionNamedArgs, ContractAbi } from "@/contracts/types";
import type {
  TxFlowRuntimeContext,
  TxPreparedWriteStep,
  TxStepResult,
  TxWriteCall,
  TxWriteFunctionName,
} from "./types";
import { Abi, ContractFunctionName } from "viem";

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



// TODO: Improve overload narrowing for named args when signatures share the same key set.
export function namedArgsToArrayStrict<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi>,
>(
  abi: TAbi,
  functionName: TFunctionName,
  args: AbiFunctionNamedArgs<TAbi, TFunctionName>,
): readonly unknown[] {
  const argKeys = Object.keys(args as Record<string, unknown>);
  const functions = abi.filter(
    (item): item is Extract<TAbi[number], { type: "function"; name: TFunctionName }> =>
      item.type === "function" && item.name === functionName,
  );

  if (functions.length === 0) {
    throw new Error(`Function ${String(functionName)} not found in ABI`);
  }

  for (const fn of functions) {
    const inputs = fn.inputs ?? [];
    let matches = inputs.length === argKeys.length;

    if (!matches) {
      continue;
    }

    for (const input of inputs) {
      if (!input.name || !(input.name in (args as Record<string, unknown>))) {
        matches = false;
        break;
      }
    }

    if (!matches) {
      continue;
    }

    return inputs.map((input) => {
      if (!input.name) {
        throw new Error(
          `Unnamed ABI parameter found in ${String(functionName)} - cannot use named args`,
        );
      }
      return (args as Record<string, unknown>)[input.name];
    });
  }

  for (const fn of functions) {
    for (const input of fn.inputs ?? []) {
      if (!input.name) {
        throw new Error(
          `Unnamed ABI parameter found in ${String(functionName)} - cannot use named args`,
        );
      }
    }
  }

  throw new Error(`No matching overload found for ${String(functionName)} with named args`);
}

export function normalizeFunctionArgs<TAbi extends Abi>(
  abi: TAbi | undefined,
  functionName: string,
  args: readonly unknown[] | Record<string, unknown> | undefined,
): readonly unknown[] | undefined {
  if (args == null) {
    return undefined;
  }

  if (Array.isArray(args)) {
    return args;
  }

  if (!abi) {
    return undefined;
  }

  return namedArgsToArrayStrict(abi, functionName as ContractFunctionName<TAbi>, args as never);
}