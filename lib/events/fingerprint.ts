import crypto from "node:crypto";

import type { RawContractEventInput } from "./types";

function normalizeHash(value: string): string {
  return value.trim().toLowerCase();
}

export function buildRawContractEventFingerprint(event: RawContractEventInput): string {
  const canonical = `${event.chainId}:${normalizeHash(event.txHash)}:${event.logIndex}`;
  return `evt_${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

export function buildInternalEventFingerprint(event: RawContractEventInput): string {
  return buildRawContractEventFingerprint(event);
}
