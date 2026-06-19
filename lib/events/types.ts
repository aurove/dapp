import type { ContractAbi } from "@/contracts/types";

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
};

export type RegisteredContract = {
  chainId: number;
  address: string;
  contractName: string;
  contractFamily: string;
  abi: ContractAbi;
  deploymentBlock?: number | null;
  source?: "static" | "runtime";
};

export type DecodedContractEvent<NamedArgs extends Record<string, unknown> = Record<string, unknown>> = {
  chainId: number;
  contractAddress: string;
  contractName: string;
  contractFamily: string;
  eventName: string;
  eventSignature: string;
  topic0: string;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  txHash: string;
  logIndex: number;
  transactionIndex: number | null;
  args: unknown[];
  namedArgs: NamedArgs;
  raw: RawContractEventInput;
  fingerprint: string;
};

export type ContractEventHandlerContext = {
  now: Date;
  fingerprint: string;
  eventIndex: number;
  eventCount: number;
  contract: RegisteredContract;
  raw: RawContractEventInput;
  logger: Pick<Console, "info" | "warn" | "error">;
};

export type ContractEventPayloadValidator = {
  validateSync(
    value: unknown,
    options?: {
      abortEarly?: boolean;
      stripUnknown?: boolean;
    },
  ): DecodedContractEvent;
};

export type ContractEventHandlerDefinition = {
  key: string;
  description: string;
  contractName: string;
  contractFamily: string;
  eventName: string;
  schema?: ContractEventPayloadValidator;
  run(ctx: ContractEventHandlerContext, event: DecodedContractEvent): Promise<unknown> | unknown;
};

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
      contractFamily: string;
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
      contractFamily?: string;
      eventName?: string;
      reason: string;
    }
  | {
      status: "failed";
      fingerprint?: string;
      chainId?: number;
      contractAddress?: string;
      contractName?: string;
      contractFamily?: string;
      eventName?: string;
      reason: string;
    };

export type InternalEventPayload = DecodedContractEvent;
export type InternalEventHandlerContext = ContractEventHandlerContext;
export type InternalEventPayloadValidator = ContractEventPayloadValidator;
export type InternalEventHandlerDefinition = ContractEventHandlerDefinition;
export type InternalEventNormalizationResult = RawContractEventNormalizationResult;
export type InternalEventProcessingResult = ContractEventProcessingResult;
