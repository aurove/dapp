import "server-only";

import { getAddress, isAddress } from "viem";

import { buildInternalEventFingerprint } from "./fingerprint";
import type { RawContractEventInput, RawContractEventNormalizationResult } from "./types";

const BATCH_CONTAINER_KEYS = [
  "events",
  "logs",
  "payloads",
  "payload",
  "records",
  "items",
  "entries",
  "messages",
  "data",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function toAddress(value: unknown): string | null {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

function toHash(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function toData(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^0x(?:[a-f0-9]{2})*$/.test(normalized) ? normalized : null;
}

function toTopics(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const topics = value.map((topic) => toHash(topic));
  if (topics.some((topic) => topic == null)) {
    return null;
  }

  return topics as string[];
}

function readValueAtPath(input: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = input;

  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}

function readFirstValue(input: Record<string, unknown>, paths: readonly (readonly string[])[]): unknown {
  for (const path of paths) {
    const resolved = readValueAtPath(input, path);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return undefined;
}

function readFirstTrimmedString(input: Record<string, unknown>, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    const resolved = toTrimmedString(readValueAtPath(input, path));
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function readFirstInteger(input: Record<string, unknown>, paths: readonly (readonly string[])[]): number | null {
  for (const path of paths) {
    const resolved = toInteger(readValueAtPath(input, path));
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

function readFirstBoolean(input: Record<string, unknown>, paths: readonly (readonly string[])[]): boolean | null {
  for (const path of paths) {
    const resolved = toBoolean(readValueAtPath(input, path));
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
}

function isBatchContainer(value: Record<string, unknown>): boolean {
  return BATCH_CONTAINER_KEYS.some((key) => Array.isArray(value[key]));
}

function collectWebhookItems(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input.flatMap((entry) => collectWebhookItems(entry));
  }

  if (!isPlainObject(input)) {
    return [];
  }

  if (isBatchContainer(input)) {
    for (const key of BATCH_CONTAINER_KEYS) {
      const value = input[key];
      if (Array.isArray(value)) {
        return value.flatMap((entry) => collectWebhookItems(entry));
      }
    }
  }

  return [input];
}

function parseRawContractEvent(input: Record<string, unknown>): RawContractEventNormalizationResult {
  const chainId = readFirstInteger(input, [["chainId"], ["chain_id"]]);
  const contractAddress = toAddress(readFirstValue(input, [["contractAddress"], ["contract_address"]]));
  const blockNumber = readFirstInteger(input, [["blockNumber"], ["block_number"]]);
  const blockHash = toHash(readFirstValue(input, [["blockHash"], ["block_hash"]]));
  const blockTimestamp = readFirstInteger(input, [["blockTimestamp"], ["block_timestamp"]]);
  const txHash = toHash(readFirstValue(input, [["txHash"], ["tx_hash"]]));
  const logIndex = readFirstInteger(input, [["logIndex"], ["log_index"]]);
  const transactionIndex = readFirstInteger(input, [["transactionIndex"], ["transaction_index"]]);
  const topics = toTopics(readFirstValue(input, [["topics"]]));
  const data = toData(readFirstValue(input, [["data"]]));
  const removed = readFirstBoolean(input, [["removed"]]);
  const provider = readFirstTrimmedString(input, [["provider"], ["source"]]);

  if (
    chainId == null ||
    contractAddress == null ||
    blockNumber == null ||
    blockHash == null ||
    blockTimestamp == null ||
    txHash == null ||
    logIndex == null ||
    topics == null ||
    data == null
  ) {
    return {
      ok: false,
      code: "MALFORMED_EVENT",
      reason: "Malformed raw contract event payload.",
    };
  }

  if (chainId < 0 || blockNumber < 0 || blockTimestamp < 0 || logIndex < 0) {
    return {
      ok: false,
      code: "MALFORMED_EVENT",
      reason: "Malformed raw contract event payload.",
    };
  }

  const raw: RawContractEventInput = {
    chainId,
    contractAddress,
    blockNumber,
    blockHash,
    blockTimestamp,
    txHash,
    logIndex,
    transactionIndex: transactionIndex == null ? null : transactionIndex,
    topics,
    data,
  };

  if (removed !== null) {
    raw.removed = removed;
  }

  if (provider) {
    raw.provider = provider;
  }

  return {
    ok: true,
    raw,
    fingerprint: buildInternalEventFingerprint(raw),
  };
}

export function normalizeInternalEvents(
  input: unknown,
  _requestEventKey: string | null = null,
): RawContractEventNormalizationResult[] {
  const items = collectWebhookItems(input);
  return items.map((item) => {
    if (!isPlainObject(item)) {
      return {
        ok: false,
        code: "MALFORMED_EVENT",
        reason: "Malformed raw contract event payload.",
      };
    }

    return parseRawContractEvent(item);
  });
}
