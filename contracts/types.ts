import { MutateOptions } from "@tanstack/react-query";
import type {
  Abi,
  AbiParameter,
  AbiParameterToPrimitiveType,
  AbiStateMutability,
  Address,
  Block,
  ContractEventName,
  ContractFunctionArgs,
  ContractFunctionName,
  GetEventArgs,
  GetTransactionReceiptReturnType,
  GetTransactionReturnType,
  Log,
  TransactionReceipt,
  WriteContractErrorType,
} from "viem";
import type { Config, UseReadContractParameters, UseWatchContractEventParameters } from "wagmi";
import type { WriteContractParameters, WriteContractReturnType } from "wagmi/actions";
import type { WriteContractVariables } from "wagmi/query";

export type InheritedFunctions = { readonly [key: string]: string };

export type GenericContract = {
  address?: Address;
  abi: Abi;
  inheritedFunctions?: InheritedFunctions;
  external?: true;
};

export type GenericContractsDeclaration = {
  [chainId: number]: {
    [contractName: string]: GenericContract;
  };
};

export type ContractName = string;

export type Contract = GenericContract;

export type ContractAbi = Contract["abi"];

type AbiFunctionFromName<TAbi extends Abi, TFunctionName extends string> = Extract<
  Extract<TAbi[number], { type: "function"; name: TFunctionName }>,
  { inputs: readonly AbiParameter[] }
>;

export type AbiFunctionInputs<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi>,
> = AbiFunctionFromName<TAbi, TFunctionName>["inputs"];

export type AbiFunctionArguments<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi>,
> = ContractFunctionArgs<TAbi, AbiStateMutability, TFunctionName>;

export type NamedAbiParameter = AbiParameter & { name: string };

export type AbiInputsToNamedArgs<TInputs extends readonly AbiParameter[]> = {
  [P in Extract<TInputs[number], NamedAbiParameter> as P["name"]]: AbiParameterToPrimitiveType<P>;
};

/**
 * Named arguments for a contract function.
 *
 * Example:
 * {
 *   to: Address;
 *   amount: bigint;
 * }
 */
export type AbiFunctionNamedArgs<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi>,
> =
  AbiFunctionFromName<TAbi, TFunctionName> extends {
    inputs: infer TInputs extends readonly AbiParameter[];
  }
    ? AbiInputsToNamedArgs<TInputs>
    : never;

export type AbiEventInputs<TAbi extends Abi, TEventName extends ContractEventName<TAbi>> = Extract<
  TAbi[number],
  { type: "event"; name: TEventName }
>["inputs"];

export enum ContractCodeStatus {
  LOADING,
  DEPLOYED,
  NOT_FOUND,
}

export type ReadAbiStateMutability = "view" | "pure";
export type WriteAbiStateMutability = "nonpayable" | "payable";

export type FunctionNamesWithInputs<
  TAbi extends Abi,
  TAbiStateMutability extends AbiStateMutability = AbiStateMutability,
> = Exclude<
  Extract<
    TAbi[number],
    {
      type: "function";
      stateMutability: TAbiStateMutability;
    }
  >,
  {
    inputs: readonly [];
  }
>["name"];

type OptionalTuple<T> = T extends readonly [infer H, ...infer R]
  ? readonly [H | undefined, ...OptionalTuple<R>]
  : T extends readonly unknown[]
    ? T
    : readonly unknown[];

type UseArgsParam<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi>,
> = Abi extends TAbi
  ? {
      args?: readonly unknown[] | Record<string, unknown>;
      value?: bigint | undefined;
    }
  : TFunctionName extends FunctionNamesWithInputs<TAbi>
    ? {
        args:
          | AbiFunctionNamedArgs<TAbi, TFunctionName>
          | OptionalTuple<AbiFunctionArguments<TAbi, TFunctionName>>;
        value?: AbiFunctionFromName<TAbi, TFunctionName> extends { stateMutability: "payable" }
          ? bigint | undefined
          : undefined;
      }
    : {
        args?: never;
      };

export type UseReadConfig<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi, ReadAbiStateMutability>,
> = {
  watch?: boolean;
  functionName: TFunctionName;
} & UseArgsParam<TAbi, TFunctionName> &
  Omit<
    UseReadContractParameters<TAbi, TFunctionName>,
    "chainId" | "abi" | "address" | "functionName" | "args"
  >;

export type WriteContractVariables<
  TAbi extends Abi,
  TFunctionName extends ContractFunctionName<TAbi, WriteAbiStateMutability>,
> = {
  functionName: TFunctionName;
} & UseArgsParam<TAbi, TFunctionName> &
  Omit<WriteContractParameters, "chainId" | "abi" | "address" | "functionName" | "args">;

type FallbackWriteVariables = {
  functionName: string;
  args?: readonly unknown[] | Record<string, unknown>;
} & Omit<WriteContractParameters, "chainId" | "abi" | "address" | "functionName" | "args">;

export type AnyWriteContractVariables<TAbi extends Abi = Abi> = [
  ContractFunctionName<TAbi, WriteAbiStateMutability>,
] extends [never]
  ? FallbackWriteVariables
  : {
      [TFunctionName in ContractFunctionName<
        TAbi,
        WriteAbiStateMutability
      >]: WriteContractVariables<TAbi, TFunctionName>;
    }[ContractFunctionName<TAbi, WriteAbiStateMutability>];

type WriteVariables = WriteContractVariables<Abi, string, readonly unknown[], Config, number>;

export type TransactorFuncOptions = {
  onBlockConfirmation?: (txnReceipt: TransactionReceipt) => void;
  blockConfirmations?: number;
};

export type WriteContractOptions = MutateOptions<
  WriteContractReturnType,
  WriteContractErrorType,
  WriteVariables,
  unknown
> &
  TransactorFuncOptions;

export type UseEventConfig<TAbi extends Abi, TEventName extends ContractEventName<TAbi>> = {
  eventName: TEventName;
} & Omit<
  UseWatchContractEventParameters<TAbi, TEventName>,
  "onLogs" | "address" | "abi" | "eventName"
> & {
    onLogs: (logs: Log[]) => void;
  };

type IndexedEventInputs<TAbi extends Abi, TEventName extends ContractEventName<TAbi>> = Extract<
  AbiEventInputs<TAbi, TEventName>[number],
  { indexed: true }
>;

export type EventFilters<TAbi extends Abi, TEventName extends ContractEventName<TAbi>> =
  IndexedEventInputs<TAbi, TEventName> extends never
    ? never
    : {
        [Key in IndexedEventInputs<TAbi, TEventName>["name"] &
          string]?: AbiParameterToPrimitiveType<
          Extract<IndexedEventInputs<TAbi, TEventName>, { name: Key }>
        >;
      };

export type UseEventHistoryConfig<
  TAbi extends Abi,
  TEventName extends ContractEventName<TAbi>,
  TBlockData extends boolean = false,
  TTransactionData extends boolean = false,
  TReceiptData extends boolean = false,
> = {
  eventName: TEventName;
  fromBlock: bigint;
  filters?: EventFilters<TAbi, TEventName>;
  blockData?: TBlockData;
  transactionData?: TTransactionData;
  receiptData?: TReceiptData;
  watch?: boolean;
  enabled?: boolean;
};

export type UseEventHistoryData<
  TAbi extends Abi,
  TEventName extends ContractEventName<TAbi>,
  TBlockData extends boolean = false,
  TTransactionData extends boolean = false,
  TReceiptData extends boolean = false,
> =
  | {
      log: Log;
      args: GetEventArgs<
        TAbi,
        TEventName,
        {
          IndexedOnly: false;
        }
      >;
      blockData: TBlockData extends true ? Block<bigint, true> : null;
      receiptData: TReceiptData extends true ? GetTransactionReturnType : null;
      transactionData: TTransactionData extends true ? GetTransactionReceiptReturnType : null;
    }[]
  | undefined;

export type AbiParameterTuple = Extract<AbiParameter, { type: "tuple" | `tuple[${string}]` }>;

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
