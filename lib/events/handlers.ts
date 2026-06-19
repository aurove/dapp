import "server-only";

import { getContractEventNames, listRegisteredContracts } from "./contracts";
import type { ContractEventHandlerDefinition, RegisteredContract } from "./types";

const shouldLogInternalEvents = (() => {
  const value = process.env.LOG_EVENTS;
  return value == null || value.toLowerCase() === "true";
})();

function logEventHandler(event: string, details: Record<string, unknown>) {
  if (shouldLogInternalEvents) {
    console.info(JSON.stringify({ scope: "internal-events", event, ...details }));
  }
}

function buildHandlerKey(contractName: string, eventName: string): string {
  return `${contractName}.${eventName}`;
}

function createPlaceholderContractEventHandler(
  contractName: string,
  contractFamily: string,
  eventName: string,
): ContractEventHandlerDefinition {
  return {
    key: buildHandlerKey(contractName, eventName),
    description: `Placeholder handler for ${contractName}.${eventName}.`,
    contractName,
    contractFamily,
    eventName,
    run(ctx, event) {
      logEventHandler("contract.event.received.placeholder", {
        contractName: event.contractName,
        contractFamily: event.contractFamily,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        fingerprint: ctx.fingerprint,
        chainId: event.chainId,
        blockNumber: event.blockNumber,
        blockTimestamp: event.blockTimestamp,
        txHash: event.txHash,
        blockHash: event.blockHash,
        namedArgs: event.namedArgs,
      });

      // TODO: replace placeholder dispatch with contract-specific ingestion handlers.
      return {
        ok: true,
        message: "Placeholder contract event handler executed.",
        contractName: event.contractName,
        contractFamily: event.contractFamily,
        contractAddress: event.contractAddress,
        eventName: event.eventName,
        namedArgs: event.namedArgs,
        blockTimestamp: event.blockTimestamp,
        txHash: event.txHash,
        blockHash: event.blockHash,
        fingerprint: ctx.fingerprint,
      };
    },
  };
}

const contractEventHandlers = new Map<string, ContractEventHandlerDefinition>();

export function registerContractEventHandlersForContract(
  contract: Pick<RegisteredContract, "contractName" | "contractFamily" | "abi">,
) {
  for (const eventName of getContractEventNames(contract.abi)) {
    const key = buildHandlerKey(contract.contractName, eventName);
    if (contractEventHandlers.has(key)) {
      continue;
    }

    contractEventHandlers.set(
      key,
      createPlaceholderContractEventHandler(contract.contractName, contract.contractFamily, eventName),
    );
  }
}

function registerDefaultContractEventHandlers() {
  for (const contract of listRegisteredContracts()) {
    registerContractEventHandlersForContract(contract);
  }
}

registerDefaultContractEventHandlers();

export function registerContractEventHandler(handler: ContractEventHandlerDefinition): ContractEventHandlerDefinition {
  contractEventHandlers.set(handler.key, handler);
  return handler;
}

export function getContractEventHandler(
  contractName: string,
  eventName: string,
): ContractEventHandlerDefinition | null {
  return contractEventHandlers.get(buildHandlerKey(contractName, eventName)) ?? null;
}

export function listContractEventHandlers(): ContractEventHandlerDefinition[] {
  return Array.from(contractEventHandlers.values());
}

export const internalEventHandlers = listContractEventHandlers();
export const internalEventHandlerMap: Map<string, ContractEventHandlerDefinition> = contractEventHandlers;
