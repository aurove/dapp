import type { Abi, ContractEventName as ViemContractEventName } from "viem";

import registry from "./registry";
import type { AbiEventInputs, AbiInputsToNamedArgs } from "./types";

type DefaultChainRegistry = (typeof registry)[31337];

export type ContractName = keyof DefaultChainRegistry;

export type ContractAbi<TContractName extends ContractName = ContractName> =
  DefaultChainRegistry[TContractName]["abi"];

export type ContractEventNameForContract<TContractName extends ContractName> =
  ViemContractEventName<ContractAbi<TContractName>>;

export type ContractEventArgs<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
> = AbiInputsToNamedArgs<AbiEventInputs<ContractAbi<TContractName>, TEventName>>;

export type ContractEventHandlerKey<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = `${TContractName}.${TEventName}`;

export type DecodedContractEvent<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = {
  chainId: number;
  contractAddress: string;
  eventName: TEventName;
  eventSignature: string;
  topic0: string;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  txHash: string;
  logIndex: number;
  transactionIndex: number | null;
  args: readonly unknown[];
  namedArgs: ContractEventArgs<TContractName, TEventName>;
  raw: {
    chainId: number;
    contractAddress: string;
    blockNumber: number;
    blockHash: string;
    blockTimestamp: number;
    txHash: string;
    logIndex: number;
    transactionIndex?: number | null;
    topics: string[];
    data: string;
    removed?: boolean;
    provider?: string;
    decoded: {
      eventName: string;
      args: unknown[];
      namedArgs: Record<string, unknown>;
    };
    transaction: {
      from: string;
      status: "success" | "reverted";
      primaryQualifyingSwapLogIndex: number | null;
    };
    position?: {
      tokenId: string;
      principalAmount0: string;
      principalAmount1: string;
      token0: string;
      token1: string;
      tickSpacing: number;
      poolAddress: string;
      owner: string;
    };
    valuationPools?: Array<{
      address: string;
      token0: string;
      token1: string;
      sqrtPriceX96: string;
      tick: number;
      liquidity: string;
    }>;
  };
  fingerprint: string;
};

export type AnyDecodedContractEvent = {
  [TContractName in ContractName]: {
    [TEventName in ContractEventNameForContract<TContractName>]: DecodedContractEvent<
      TContractName,
      TEventName
    >;
  }[ContractEventNameForContract<TContractName>];
}[ContractName];

export type ContractEventHandlerContext = {
  chainTime: Date;
  fingerprint: string;
  eventIndex: number;
  eventCount: number;
  contract: {
    chainId: number;
    address: string;
    contractName: ContractName;
    abi: Abi;
    deploymentBlock?: number | null;
    source?: "static" | "runtime";
  };
  raw: DecodedContractEvent["raw"];
  logger: Pick<Console, "info" | "warn" | "error">;
};

export type ContractEventPayloadValidator<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = {
  validateSync(
    value: unknown,
    options?: {
      abortEarly?: boolean;
      stripUnknown?: boolean;
    },
  ): DecodedContractEvent<TContractName, TEventName>;
};

export type ContractEventHandlerDefinition<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = {
  key: ContractEventHandlerKey<TContractName, TEventName>;
  description: string;
  contractName: TContractName;
  eventName: TEventName;
  schema?: ContractEventPayloadValidator<TContractName, TEventName>;
  run(
    ctx: ContractEventHandlerContext,
    event: DecodedContractEvent<TContractName, TEventName>,
  ): Promise<unknown> | unknown;
};

export type AnyContractEventHandlerDefinition = {
  key: string;
  description: string;
  contractName: ContractName;
  eventName: string;
  schema?: ContractEventPayloadValidator;
  run(ctx: ContractEventHandlerContext, event: AnyDecodedContractEvent): Promise<unknown> | unknown;
};

export function buildHandlerKey<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(
  contractName: TContractName,
  eventName: TEventName,
): ContractEventHandlerKey<TContractName, TEventName> {
  return `${contractName}.${eventName}` as ContractEventHandlerKey<TContractName, TEventName>;
}
