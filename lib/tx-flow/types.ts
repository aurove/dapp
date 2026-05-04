import type { ContractFunctionName, TransactionReceipt } from "viem";
import type { WriteAbiStateMutability } from "@/contracts/types";
import type { ContractAbi, WriteContractVariables } from "@/contracts/types";
import type { RegistryContractConfig, RegistryContractName } from "@/contracts/client";
import contracts from "@/contracts/registry";
import type { usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";

export type TxIconState = "idle" | "error" | "success" | "pending";

export type TxContractsDeclaration = typeof contracts;

export type TxContractName = RegistryContractName;

export type TxContractMeta<TContractName extends TxContractName = TxContractName> =
  RegistryContractConfig<TContractName>;

export type TxDeployedContractMeta<TContractName extends TxContractName = TxContractName> =
  RegistryContractConfig<TContractName> & { address: Address };

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

export type TxFlowRuntimeContext = {
  account: `0x${string}`;
  chainId: number;
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  writeAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  contracts: TxContractsDeclaration;
  notify?: TxNotifyApi;
};

export type TxWriteLifecycleHooks = {
  onPending?: (args: {
    key: string;
    label: string;
    ctx: TxFlowRuntimeContext;
  }) => unknown | Promise<unknown>;
  onAwaitingWalletConfirmation?: (args: {
    key: string;
    label: string;
    ctx: TxFlowRuntimeContext;
    meta: unknown;
  }) => void | Promise<void>;
  onTransactionSubmitted?: (args: {
    key: string;
    label: string;
    ctx: TxFlowRuntimeContext;
    hash: `0x${string}`;
    meta: unknown;
  }) => void | Promise<void>;
  onTransactionConfirmed?: (args: {
    key: string;
    label: string;
    ctx: TxFlowRuntimeContext;
    hash: `0x${string}`;
    receipt: unknown;
    meta: unknown;
  }) => void | Promise<void>;
  onTransactionFailed?: (args: {
    key: string;
    label: string;
    ctx: TxFlowRuntimeContext;
    error: unknown;
    message: string;
    meta: unknown;
  }) => void | Promise<void>;
};

export type TxWriteFunctionName<TAbi extends ContractAbi> = ContractFunctionName<
  TAbi,
  WriteAbiStateMutability
>;

export type TxContractWritePayload<
  TAbi extends ContractAbi,
  TFunctionName extends TxWriteFunctionName<TAbi>,
> = WriteContractVariables<TAbi, TFunctionName>;

export type TxAddressWritePayload<
  TAbi extends ContractAbi,
  TFunctionName extends TxWriteFunctionName<TAbi>,
> = WriteContractVariables<TAbi, TFunctionName>;

export type TxWriteCall<
  TAbi extends ContractAbi = ContractAbi,
  TFunctionName extends TxWriteFunctionName<TAbi> = TxWriteFunctionName<TAbi>,
> = {
  contract: TxDeployedContractMeta;
  request: TxContractWritePayload<TAbi, TFunctionName>;
  confirmations?: number;
};

export type TxPreparedWriteStep<
  TAbi extends import("viem").Abi = import("viem").Abi,
  TFunctionName extends TxWriteFunctionName<TAbi> = TxWriteFunctionName<TAbi>,
> = {
  type: "write";
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => Promise<boolean> | boolean;
  prepare: (
    ctx: TxFlowRuntimeContext,
    prev: TxStepResult[],
  ) => Promise<TxWriteCall<TAbi, TFunctionName>> | TxWriteCall<TAbi, TFunctionName>;
  onSimulated?: (
    simulation: Awaited<ReturnType<TxFlowRuntimeContext["publicClient"]["simulateContract"]>>,
  ) => void;
};

export type TxRunnableStep = {
  type: "custom";
  key: string;
  displayLabelBtn?: boolean;
  label: string;
  run: (ctx: TxFlowRuntimeContext) => Promise<"skip" | Omit<TxStepResult, "key" | "label">>;
};

export type TxStep = TxRunnableStep | TxPreparedWriteStep;

export type TxFlowBuilder = (ctx: { account: `0x${string}`; chainId: number }) => TxStep[];

export type TxContractResolver =
  | string
  | ((ctx: TxFlowRuntimeContext) => TxContractMeta | Promise<TxContractMeta>);
