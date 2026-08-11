import "server-only";

import { toEventSelector, toEventSignature, type AbiEvent } from "viem";

import { buildInternalEventFingerprint } from "./fingerprint";
import type { AnyContractEvent, RawContractEventInput, RegisteredContract } from "./types";

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

    if (raw.decoded.eventName !== eventAbi.name) {
      return null;
    }

    const inputs = eventAbi.inputs ?? [];
    if (
      raw.decoded.args.length !== inputs.length ||
      inputs.some((input, index) => {
        const key = input.name?.trim() || String(index);
        return !(key in raw.decoded.namedArgs);
      })
    ) {
      return null;
    }

    return {
      chainId: raw.chainId,
      contractAddress: contract.address,
      eventName: raw.decoded.eventName,
      eventSignature: toEventSignature(eventAbi),
      topic0: raw.topics[0] ?? "",
      blockNumber: raw.blockNumber,
      blockHash: raw.blockHash,
      blockTimestamp: raw.blockTimestamp,
      txHash: raw.txHash,
      logIndex: raw.logIndex,
      transactionIndex: raw.transactionIndex ?? null,
      args: raw.decoded.args,
      namedArgs: raw.decoded.namedArgs,
      raw,
      fingerprint: buildInternalEventFingerprint(raw),
    } as unknown as AnyContractEvent;
  } catch {
    return null;
  }
}
