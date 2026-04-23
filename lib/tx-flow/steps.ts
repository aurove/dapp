import { Abi, Address } from "viem";

import type { TxFlowRuntimeContext } from "./context";
import type {
  TxAddressWritePayload,
  TxContractMeta,
  TxContractWritePayload,
  TxContractsDeclaration,
  TxPreparedWriteStep,
  TxStepResult,
  TxContractName,
  TxWriteFunctionName,
} from "./types";

type ContractAbi<TContractName extends TxContractName> =
  TxContractMeta<TContractName> extends {
    abi: infer TAbi extends Abi;
  }
    ? TAbi
    : Abi;

export function getContractMetaUnsafe<TContractName extends TxContractName>(
  contractName: TContractName,
  chainId: number,
  contracts: TxContractsDeclaration,
): TxContractMeta<TContractName> {
  const meta = contracts[chainId]?.[contractName];

  if (!meta?.address) {
    throw new Error(`Missing deployment or address for ${contractName} on chainId=${chainId}`);
  }

  return meta as TxContractMeta<TContractName>;
}

type ContractWriteStepConfig<
  TContractName extends TxContractName,
  TAbi extends Abi = ContractAbi<TContractName>,
  TFunctionName extends TxWriteFunctionName = TxWriteFunctionName,
> = {
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  contractName: TContractName;
  variables:
    | TxContractWritePayload<TAbi, TFunctionName>
    | ((args: { prev: TxStepResult[] }) => TxContractWritePayload<TAbi, TFunctionName>)
    | ((args: { prev: TxStepResult[] }) => Promise<TxContractWritePayload<TAbi, TFunctionName>>);
  confirmations?: number;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => Promise<boolean> | boolean;
  onSimulated?: (
    simulation: Awaited<ReturnType<TxFlowRuntimeContext["publicClient"]["simulateContract"]>>,
  ) => void;
};

export function makeContractWriteStep<
  const TContractName extends TxContractName,
  TAbi extends Abi = ContractAbi<TContractName>,
  TFunctionName extends TxWriteFunctionName = TxWriteFunctionName,
>(
  cfg: ContractWriteStepConfig<TContractName, TAbi, TFunctionName>,
): TxPreparedWriteStep<TAbi, TFunctionName> {
  return {
    key: cfg.key,
    label: cfg.label,
    displayLabelBtn: cfg.displayLabelBtn,
    shouldSkip: cfg.shouldSkip,
    onSimulated: cfg.onSimulated,
    prepare: async (ctx, prev) => {
      const contract = getContractMetaUnsafe(
        cfg.contractName,
        ctx.chainId,
        ctx.contracts,
      ) as TxContractMeta<TContractName>;

      const request =
        typeof cfg.variables === "function" ? await cfg.variables({ prev }) : cfg.variables;

      return {
        contract,
        request,
        confirmations: cfg.confirmations,
      };
    },
    type: "write",
  };
}

type AddressWriteStepConfig<TAbi extends Abi, TFunctionName extends TxWriteFunctionName> = {
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  abi: TAbi;
  address: Address;
  variables:
    | TxAddressWritePayload<TAbi, TFunctionName>
    | ((args: { prev: TxStepResult[] }) => TxAddressWritePayload<TAbi, TFunctionName>)
    | ((args: { prev: TxStepResult[] }) => Promise<TxAddressWritePayload<TAbi, TFunctionName>>);
  confirmations?: number;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => Promise<boolean> | boolean;
  onSimulated?: (
    simulation: Awaited<ReturnType<TxFlowRuntimeContext["publicClient"]["simulateContract"]>>,
  ) => void;
};

export function makeAddressWriteStep<TAbi extends Abi, TFunctionName extends TxWriteFunctionName>(
  cfg: AddressWriteStepConfig<TAbi, TFunctionName>,
): TxPreparedWriteStep<TAbi, TFunctionName> {
  return {
    key: cfg.key,
    label: cfg.label,
    displayLabelBtn: cfg.displayLabelBtn,
    shouldSkip: cfg.shouldSkip,
    onSimulated: cfg.onSimulated,
    prepare: async (_ctx, prev) => {
      const request =
        typeof cfg.variables === "function" ? await cfg.variables({ prev }) : cfg.variables;

      return {
        contract: {
          address: cfg.address,
          abi: cfg.abi,
        },
        request,
        confirmations: cfg.confirmations,
      };
    },
    type: "write",
  };
}
