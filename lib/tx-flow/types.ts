import {
  Abi,
  AbiParameter,
  AbiParameterToPrimitiveType,
  AbiParametersToPrimitiveTypes,
  ExtractAbiFunction,
} from "abitype";
import { Address, TransactionReceipt } from "viem";
import type { RegistryContractConfig, RegistryContractName } from "@/contracts/client";
import type contracts from "@/contracts/registry";

export type TxIconState = "idle" | "error" | "success" | "pending";

export type TxContractsDeclaration = typeof contracts;

export type TxContractName = RegistryContractName;

export type TxContractMeta<TContractName extends TxContractName = TxContractName> =
  RegistryContractConfig<TContractName>;

export type TxNotifyPatch = {
  chainId?: number;
  dismissAfterMs?: number;
  message?: string;
  persistent?: boolean;
  txHash?: `0x${string}`;
  type?: "info" | "pending" | "success" | "error";
  [key: string]: unknown;
};

export type TxNotifyApi = {
  pendingTx: (title: string, message?: string, meta?: { chainId?: number }) => string;
  update: (id: string, patch: TxNotifyPatch) => void;
  txSent: (id: string, hash: `0x${string}`) => void;
  txConfirmed: (id: string, message?: string) => void;
  txFailed: (id: string, message?: string) => void;
};

export type TxStepResult = {
  key: string;
  label: string;
  skipped?: boolean;
  hash?: `0x${string}`;
  receipt?: TransactionReceipt;
};

export type TxWriteAbiStateMutability = "nonpayable" | "payable";

type TxDistributiveExtractAbiFunction<
  TAbi extends Abi,
  TFunctionName extends string,
> = TAbi extends Abi ? ExtractAbiFunction<TAbi, TFunctionName> : never;

type TxAbiFunctionFromName<
  TAbi extends Abi,
  TFunctionName extends string,
> = TxDistributiveExtractAbiFunction<TAbi, TFunctionName>;

export type TxNamedAbiParameter = AbiParameter & { name: string };

export type TxFunctionInputs<
  TAbi extends Abi,
  TFunctionName extends string,
> = TxAbiFunctionFromName<TAbi, TFunctionName>["inputs"];

export type TxFunctionArguments<
  TAbi extends Abi,
  TFunctionName extends string,
> = AbiParametersToPrimitiveTypes<TxFunctionInputs<TAbi, TFunctionName>>;

export type TxFunctionNamedArgs<TAbi extends Abi, TFunctionName extends string> = {
  [P in Extract<
    TxFunctionInputs<TAbi, TFunctionName>[number],
    TxNamedAbiParameter
  > as P["name"]]: AbiParameterToPrimitiveType<P>;
};

export type TxWriteFunctionName = string;

export type TxWriteValue<
  TAbi extends Abi,
  TFunctionName extends TxWriteFunctionName,
> = ExtractAbiFunction<TAbi, TFunctionName>["stateMutability"] extends "payable"
  ? bigint | undefined
  : undefined;

export type TxContractWritePayload<TAbi extends Abi, TFunctionName extends TxWriteFunctionName> = {
  functionName: TFunctionName;
  args?: TxFunctionNamedArgs<TAbi, TFunctionName> | TxFunctionArguments<TAbi, TFunctionName>;
  value?: TxWriteValue<TAbi, TFunctionName>;
};

export type TxAddressWritePayload<TAbi extends Abi, TFunctionName extends TxWriteFunctionName> = {
  functionName: TFunctionName;
  args?: TxFunctionNamedArgs<TAbi, TFunctionName> | TxFunctionArguments<TAbi, TFunctionName>;
  value?: TxWriteValue<TAbi, TFunctionName>;
};

export type TxResolvedContract<TAbi extends Abi = Abi> = {
  address?: Address;
  abi: TAbi;
};

export type TxWriteCall<
  TAbi extends Abi = Abi,
  TFunctionName extends TxWriteFunctionName = TxWriteFunctionName,
> = {
  contract: TxResolvedContract<TAbi>;
  request: TxContractWritePayload<TAbi, TFunctionName>;
  confirmations?: number;
};

export type TxPreparedWriteStep<
  TAbi extends Abi = Abi,
  TFunctionName extends TxWriteFunctionName = string,
> = {
  type: "write";
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  shouldSkip?: (ctx: import("./context").TxFlowRuntimeContext) => Promise<boolean> | boolean;
  prepare: (
    ctx: import("./context").TxFlowRuntimeContext,
    prev: TxStepResult[],
  ) => Promise<TxWriteCall<TAbi, TFunctionName>> | TxWriteCall<TAbi, TFunctionName>;
  onSimulated?: (
    simulation: Awaited<
      ReturnType<import("./context").TxFlowRuntimeContext["publicClient"]["simulateContract"]>
    >,
  ) => void;
};

export type TxRunnableStep = {
  type: "custom";
  key: string;
  displayLabelBtn?: boolean;
  label: string;
  run: (
    ctx: import("./context").TxFlowRuntimeContext,
  ) => Promise<"skip" | Omit<TxStepResult, "key" | "label">>;
};

export type TxStep = TxRunnableStep | TxPreparedWriteStep;

export type TxFlowBuilder = (ctx: { account: Address; chainId: number }) => TxStep[];

export type TxContractResolver =
  | string
  | ((ctx: import("./context").TxFlowRuntimeContext) => TxContractMeta | Promise<TxContractMeta>);
