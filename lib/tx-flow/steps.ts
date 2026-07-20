import { erc1155Abi, erc20Abi, erc721Abi, type Abi, type Address } from "viem";

import type { GenericContractsDeclaration } from "@/contracts/types";
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

export type TokenApprovalRequirement =
  | {
      standard: "erc20";
      token: Address;
      spender: Address;
      amount: bigint;
    }
  | {
      standard: "erc721";
      token: Address;
      operator: Address;
      scope: { kind: "token"; tokenId: bigint } | { kind: "all" };
    }
  | {
      standard: "erc1155";
      token: Address;
      operator: Address;
    };

type TokenApprovalStepConfig = {
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  approval: TokenApprovalRequirement;
  confirmations?: number;
};

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

export async function isTokenApprovalSatisfied(
  ctx: Pick<TxFlowRuntimeContext, "account" | "publicClient">,
  approval: TokenApprovalRequirement,
): Promise<boolean> {
  if (approval.standard === "erc20") {
    if (approval.amount <= 0n) return true;
    const allowance = await ctx.publicClient.readContract({
      address: approval.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ctx.account, approval.spender],
    });
    return allowance >= approval.amount;
  }

  if (approval.standard === "erc721") {
    if (approval.scope.kind === "token") {
      const approved = await ctx.publicClient.readContract({
        address: approval.token,
        abi: erc721Abi,
        functionName: "getApproved",
        args: [approval.scope.tokenId],
      });
      if (sameAddress(approved, approval.operator)) return true;
    }

    return ctx.publicClient.readContract({
      address: approval.token,
      abi: erc721Abi,
      functionName: "isApprovedForAll",
      args: [ctx.account, approval.operator],
    });
  }

  return ctx.publicClient.readContract({
    address: approval.token,
    abi: erc1155Abi,
    functionName: "isApprovedForAll",
    args: [ctx.account, approval.operator],
  });
}

/**
 * Builds a token approval step whose allowance/operator check runs immediately
 * before execution. The write is recorded as skipped when the current on-chain
 * approval already satisfies the requirement.
 */
export function makeTokenApprovalStep(cfg: TokenApprovalStepConfig): TxPreparedWriteStep {
  const common = {
    key: cfg.key,
    label: cfg.label,
    displayLabelBtn: cfg.displayLabelBtn,
    confirmations: cfg.confirmations,
    shouldSkip: (ctx: TxFlowRuntimeContext) => isTokenApprovalSatisfied(ctx, cfg.approval),
  };

  if (cfg.approval.standard === "erc20") {
    return makeAddressWriteStep({
      ...common,
      address: cfg.approval.token,
      abi: erc20Abi,
      variables: {
        functionName: "approve",
        args: [cfg.approval.spender, cfg.approval.amount],
      },
    }) as unknown as TxPreparedWriteStep;
  }

  if (cfg.approval.standard === "erc721") {
    return makeAddressWriteStep({
      ...common,
      address: cfg.approval.token,
      abi: erc721Abi,
      variables:
        cfg.approval.scope.kind === "token"
          ? {
              functionName: "approve",
              args: [cfg.approval.operator, cfg.approval.scope.tokenId],
            }
          : {
              functionName: "setApprovalForAll",
              args: [cfg.approval.operator, true],
            },
    } as AddressWriteStepConfig<typeof erc721Abi, "approve" | "setApprovalForAll">) as unknown as TxPreparedWriteStep;
  }

  return makeAddressWriteStep({
    ...common,
    address: cfg.approval.token,
    abi: erc1155Abi,
    variables: {
      functionName: "setApprovalForAll",
      args: [cfg.approval.operator, true],
    },
  }) as unknown as TxPreparedWriteStep;
}

export function getContractMetaUnsafe<TContractName extends TxContractName>(
  contractName: TContractName,
  chainId: number,
  contracts: TxContractsDeclaration,
): TxDeployedContractMeta<TContractName> {
  // Index through the registry's runtime shape instead of asking TypeScript to
  // produce a union of every generated ABI on every configured chain.
  const chainContracts = (contracts as GenericContractsDeclaration)[chainId];
  const meta = chainContracts?.[contractName];
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
