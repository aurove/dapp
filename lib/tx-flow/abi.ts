import { Abi, ExtractAbiFunction, ExtractAbiFunctionNames } from "abitype";

import type { TxFunctionNamedArgs } from "./types";

export function namedArgsToArrayStrict<
  TAbi extends Abi,
  TFunctionName extends ExtractAbiFunctionNames<TAbi>,
>(
  abi: TAbi,
  functionName: TFunctionName,
  args: TxFunctionNamedArgs<TAbi, TFunctionName>,
): readonly unknown[] {
  const argKeys = Object.keys(args as Record<string, unknown>);

  const fns = abi.filter(
    (item): item is ExtractAbiFunction<TAbi, TFunctionName> =>
      item.type === "function" && item.name === functionName,
  );

  if (fns.length === 0) {
    throw new Error(`Function ${String(functionName)} not found in ABI`);
  }

  for (const fn of fns) {
    let matches = true;

    if (fn.inputs.length !== argKeys.length) {
      matches = false;
    } else {
      for (const input of fn.inputs) {
        if (!input.name || !(input.name in (args as Record<string, unknown>))) {
          matches = false;
          break;
        }
      }
    }

    if (!matches) continue;
    return fn.inputs.map((input) => args[input.name as keyof typeof args]);
  }

  for (const fn of fns) {
    for (const input of fn.inputs) {
      if (!input.name) {
        throw new Error(
          `Unnamed ABI parameter found in ${String(functionName)}; cannot use named args`,
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
  if (args == null) return undefined;
  if (Array.isArray(args)) return args;
  if (!abi) return undefined;

  return namedArgsToArrayStrict(
    abi,
    functionName as ExtractAbiFunctionNames<TAbi>,
    args as TxFunctionNamedArgs<TAbi, ExtractAbiFunctionNames<TAbi>>,
  );
}
