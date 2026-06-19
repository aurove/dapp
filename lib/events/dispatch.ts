import "server-only";

import type {
  ContractEventHandlerContext,
  ContractEventProcessingResult,
  AnyContractEvent,
} from "./types";
import { getContractEventHandler, registerContractEventHandlersForContract } from "./handlers";

function isHandlerResultObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function dispatchDecodedContractEvent(
  ctx: ContractEventHandlerContext,
  event: AnyContractEvent,
): Promise<ContractEventProcessingResult> {
  let handler = getContractEventHandler(ctx.contract.contractName, event.eventName as string);
  if (!handler) {
    registerContractEventHandlersForContract(ctx.contract);
    handler = getContractEventHandler(ctx.contract.contractName, event.eventName as string);
  }
  if (!handler) {
    return {
      status: "failed",
      fingerprint: event.fingerprint,
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      contractName: ctx.contract.contractName,
      eventName: event.eventName,
      reason: "Unknown contract event handler.",
    };
  }

  try {
    if (handler.schema) {
      handler.schema.validateSync(event, {
        abortEarly: false,
        stripUnknown: false,
      });
    }

    const result = await handler.run(ctx, event);
    if (isHandlerResultObject(result) && result.status === "skipped") {
      return {
        status: "skipped",
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        contractAddress: event.contractAddress,
        contractName: ctx.contract.contractName,
        eventName: event.eventName,
        reason: typeof result.reason === "string" ? result.reason : "Handler skipped event.",
      };
    }

    if (isHandlerResultObject(result) && result.status === "failed") {
      return {
        status: "failed",
        fingerprint: event.fingerprint,
        chainId: event.chainId,
        contractAddress: event.contractAddress,
        contractName: ctx.contract.contractName,
        eventName: event.eventName,
        reason: typeof result.reason === "string" ? result.reason : "Handler execution failed.",
      };
    }

    return {
      status: "processed",
      fingerprint: event.fingerprint,
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      contractName: ctx.contract.contractName,
      eventName: event.eventName,
      handlerKey: handler.key,
      result,
    };
  } catch (error) {
    return {
      status: "failed",
      fingerprint: event.fingerprint,
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      contractName: ctx.contract.contractName,
      eventName: event.eventName,
      reason: error instanceof Error ? error.message : "Handler execution failed.",
    };
  }
}
