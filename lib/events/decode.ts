import "server-only";

import { decodeEventLog, toEventSelector, toEventSignature, type Abi, type AbiEvent, type Hex } from "viem";

import { buildInternalEventFingerprint } from "./fingerprint";
import { toJsonSafeValue } from "./json-safe";
import type { AnyContractEvent, RawContractEventInput, RegisteredContract } from "./types";

function buildNamedArgs(parsedArgs: readonly unknown[], inputNames: readonly { name?: string }[]): Record<string, unknown> {
  return inputNames.reduce<Record<string, unknown>>((accumulator, input, index) => {
    const key = input.name?.trim() || String(index);
    accumulator[key] = toJsonSafeValue(parsedArgs[index]);
    return accumulator;
  }, {});
}

function buildOrderedArgs(
  parsedArgs: readonly unknown[] | Record<string, unknown> | undefined,
  inputNames: readonly { name?: string }[],
): unknown[] {
  if (!parsedArgs) {
    return [];
  }

  return inputNames.map((input, index) => {
    if (Array.isArray(parsedArgs)) {
      return toJsonSafeValue(parsedArgs[index]);
    }

    const recordArgs = parsedArgs as Record<string, unknown>;
    const namedKey = input.name?.trim();
    if (namedKey && namedKey in recordArgs) {
      return toJsonSafeValue(recordArgs[namedKey]);
    }

    const positionalKey = String(index);
    if (positionalKey in recordArgs) {
      return toJsonSafeValue(recordArgs[positionalKey]);
    }

    return undefined;
  });
}

export function decodeContractEvent(
  contract: RegisteredContract,
  raw: RawContractEventInput,
): AnyContractEvent | null {
  if (!contract.abi || contract.abi.length === 0) {
    return null;
  }

  try {
    const eventAbi = contract.abi.find(
      (item): item is AbiEvent => item.type === "event" && toEventSelector(item) === raw.topics[0],
    );

    if (!eventAbi) {
      return null;
    }

    const parsed = decodeEventLog({
      abi: contract.abi as Abi,
      topics: raw.topics as [] | [signature: Hex, ...args: Hex[]],
      data: raw.data as Hex,
      strict: false,
    });

    if (String(parsed.eventName) !== eventAbi.name) {
      return null;
    }

    const inputs = eventAbi.inputs ?? [];
    const args = buildOrderedArgs(parsed.args, inputs);
    const namedArgs = buildNamedArgs(args, inputs);

    return {
      chainId: raw.chainId,
      contractAddress: contract.address,
      eventName: parsed.eventName,
      eventSignature: toEventSignature(eventAbi),
      topic0: raw.topics[0] ?? "",
      blockNumber: raw.blockNumber,
      blockHash: raw.blockHash,
      blockTimestamp: raw.blockTimestamp,
      txHash: raw.txHash,
      logIndex: raw.logIndex,
      transactionIndex: raw.transactionIndex ?? null,
      args,
      namedArgs,
      raw,
      fingerprint: buildInternalEventFingerprint(raw),
    } as unknown as AnyContractEvent;
  } catch {
    return null;
  }
}
