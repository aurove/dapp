import "server-only";

import type {
  ContractEventHandlerDefinition,
  AnyContractEventHandler,
} from "./types";
import type {
  ContractEventNameForContract,
  ContractName,
} from "@/contracts/event-types";
import { buildHandlerKey as buildHandlerKeyTyped } from "@/contracts/event-types";

const contractEventHandlers = new Map<string, AnyContractEventHandler>();

export { buildHandlerKeyTyped as buildHandlerKey };

export function registerContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(handler: ContractEventHandlerDefinition<TContractName, TEventName>): ContractEventHandlerDefinition<TContractName, TEventName> {
  contractEventHandlers.set(handler.key, handler as unknown as AnyContractEventHandler);
  return handler;
}

export function getContractEventHandler<
  TContractName extends ContractName,
  TEventName extends ContractEventNameForContract<TContractName>,
>(
  contractName: TContractName,
  eventName: TEventName,
): ContractEventHandlerDefinition<TContractName, TEventName> | null;
export function getContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler | null;
export function getContractEventHandler(
  contractName: ContractName,
  eventName: string,
): AnyContractEventHandler | null {
  return contractEventHandlers.get(`${contractName}.${eventName}`) ?? null;
}

export function countRegisteredContractEventHandlers(): number {
  return contractEventHandlers.size;
}
