import type {
  AnyContractEventHandlerDefinition,
  AnyDecodedContractEvent,
  ContractEventArgs,
  ContractEventHandlerContext as SharedContractEventHandlerContext,
  ContractEventHandlerDefinition as SharedContractEventHandlerDefinition,
  ContractEventHandlerKey,
  ContractEventNameForContract,
  ContractEventPayloadValidator as SharedContractEventPayloadValidator,
  ContractName,
  DecodedContractEvent as SharedDecodedContractEvent,
} from "@/contracts/event-types";

export type RawContractEventInput = {
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

export type RegisteredContract = {
  chainId: number;
  address: string;
  contractName: ContractName;
  abi: import("viem").Abi;
  deploymentBlock?: number | null;
  source?: "static" | "runtime";
};

export type DecodedContractEvent<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = SharedDecodedContractEvent<TContractName, TEventName>;

export type ContractEventHandlerContext = SharedContractEventHandlerContext;

export type ContractEventPayloadValidator<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = SharedContractEventPayloadValidator<TContractName, TEventName>;

export type ContractEventHandlerDefinition<
  TContractName extends ContractName = ContractName,
  TEventName extends ContractEventNameForContract<TContractName> =
    ContractEventNameForContract<TContractName>,
> = SharedContractEventHandlerDefinition<TContractName, TEventName>;

export type DecodedContractEventArgs<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
> = ContractEventArgs<TContractName, TEventName>;

export type ContractEventHandlerKeyFor<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
> = ContractEventHandlerKey<TContractName, TEventName>;

export type AnyContractEvent = AnyDecodedContractEvent;
export type AnyContractEventHandler = AnyContractEventHandlerDefinition;

export type RawContractEventNormalizationResult =
  | {
      ok: true;
      raw: RawContractEventInput;
      fingerprint: string;
    }
  | {
      ok: false;
      code: "MALFORMED_EVENT" | "PAYLOAD_TOO_LARGE";
      reason: string;
    };

export type DecodedContractEventNormalizationResult =
  | {
      ok: true;
      event: DecodedContractEvent;
      fingerprint: string;
    }
  | {
      ok: false;
      code: "UNKNOWN_CONTRACT" | "MISSING_ABI" | "UNDECODABLE_LOG";
      reason: string;
    };

export type ContractEventProcessingResult =
  | {
      status: "processed";
      fingerprint: string;
      chainId: number;
      contractAddress: string;
      contractName: string;
      eventName: string;
      handlerKey: string;
      result: unknown;
    }
  | {
      status: "skipped";
      fingerprint?: string;
      chainId?: number;
      contractAddress?: string;
      contractName?: string;
      eventName?: string;
      reason: string;
    }
  | {
      status: "failed";
      fingerprint?: string;
      chainId?: number;
      contractAddress?: string;
      contractName?: string;
      eventName?: string;
      reason: string;
    };

export type InternalEventPayload = DecodedContractEvent;
export type InternalEventHandlerContext = ContractEventHandlerContext;
export type InternalEventPayloadValidator = ContractEventPayloadValidator;
export type InternalEventHandlerDefinition = ContractEventHandlerDefinition;
export type InternalEventNormalizationResult = RawContractEventNormalizationResult;
export type InternalEventProcessingResult = ContractEventProcessingResult;
