import type { Abi } from "viem";

import type { TxFlowRuntimeContext } from "./types";
import type {
  TxAddressWritePayload,
  TxContractMeta,
  TxDeployedContractMeta,
  TxContractName,
  TxContractWritePayload,
  TxContractsDeclaration,
  TxPreparedWriteStep,
  TxWriteCall,
  TxStepResult,
  TxWriteFunctionName,
} from "./types";

type ContractAbiFor<TContractName extends TxContractName> = TxContractMeta<TContractName>["abi"];

export function getContractMetaUnsafe<TContractName extends TxContractName>(
  contractName: TContractName,
  chainId: number,
  contracts: TxContractsDeclaration,
): TxDeployedContractMeta<TContractName> {
  const chainContracts = contracts[chainId as keyof typeof contracts];
  const meta = chainContracts?.[contractName] as TxDeployedContractMeta<TContractName> | undefined;
  if (!meta?.address) {
    throw new Error(`Missing deployment or address for ${contractName} on chainId=${chainId}`);
  }
  return meta as TxDeployedContractMeta<TContractName>;
}

type ContractWriteStepConfig<
  TContractName extends TxContractName,
  TAbi extends ContractAbiFor<TContractName> = ContractAbiFor<TContractName>,
  TFunctionName extends TxWriteFunctionName<TAbi> = TxWriteFunctionName<TAbi>,
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
  TAbi extends ContractAbiFor<TContractName> = ContractAbiFor<TContractName>,
  TFunctionName extends TxWriteFunctionName<TAbi> = TxWriteFunctionName<TAbi>,
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
      const contract = getContractMetaUnsafe(cfg.contractName, ctx.chainId, ctx.contracts);
      const request =
        typeof cfg.variables === "function" ? await cfg.variables({ prev }) : cfg.variables;
      return {
        contract,
        request,
        confirmations: cfg.confirmations,
      } as unknown as TxWriteCall<TAbi, TFunctionName>;
    },
    type: "write",
  };
}

type AddressWriteStepConfig<TAbi extends Abi, TFunctionName extends TxWriteFunctionName<TAbi>> = {
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  abi: TAbi;
  address: `0x${string}`;
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

export function makeAddressWriteStep<
  TAbi extends Abi,
  TFunctionName extends TxWriteFunctionName<TAbi>,
>(cfg: AddressWriteStepConfig<TAbi, TFunctionName>): TxPreparedWriteStep<TAbi, TFunctionName> {
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
      } as unknown as TxWriteCall<TAbi, TFunctionName>;
    },
    type: "write",
  };
}
