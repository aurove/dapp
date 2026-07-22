import { NextRequest } from "next/server";

import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";
import { verifyInternalEventsRequest } from "@/lib/events/auth";
import { getRegisteredContract } from "@/lib/events/contracts";
import { decodeContractEvent } from "@/lib/events/decode";
import { dispatchDecodedContractEvent } from "@/lib/events/dispatch";
import { normalizeInternalEvents } from "@/lib/events";
import { stringifyJsonSafe } from "@/lib/events/json-safe";
import {
  countRegisteredContractEventHandlers,
  hasRegisteredContractEventHandlers,
} from "@/lib/events/handlers";
import type { ContractEventProcessingResult } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

const shouldLogInternalEvents = (() => {
  const value = process.env.LOG_EVENTS;
  return value == null || value.toLowerCase() === "true";
})();

function logInternalEventError(event: string, details: Record<string, unknown>) {
  if (shouldLogInternalEvents) {
    console.error(stringifyJsonSafe({ scope: "internal-events", event, ...details }));
  }
}

function getMaxWebhookBodyBytes(): number {
  const configured = Number(process.env.EVENTS_WEBHOOK_MAX_BODY_BYTES);
  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_WEBHOOK_BODY_BYTES;
}

async function postInternalEvents(request: NextRequest) {
  const authResult = verifyInternalEventsRequest(request);
  if (!authResult.ok) {
    return createNoStoreErrorResponse(authResult.message, authResult.status, authResult.code);
  }

  const rawBody = await request.text();
  const bodyBytes = Buffer.byteLength(rawBody, "utf8");
  const maxBodyBytes = getMaxWebhookBodyBytes();
  if (bodyBytes > maxBodyBytes) {
    return createNoStoreErrorResponse(
      `Payload exceeds the maximum allowed size of ${maxBodyBytes} bytes.`,
      413,
      "EVENTS_PAYLOAD_TOO_LARGE",
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    return createNoStoreErrorResponse("Invalid JSON payload.", 400, "EVENTS_BAD_REQUEST");
  }

  const normalizedEvents = normalizeInternalEvents(parsedBody);
  if (normalizedEvents.length === 0) {
    return createNoStoreErrorResponse(
      "No internal events were found in the request.",
      400,
      "EVENTS_BAD_REQUEST",
    );
  }

  const requestReceivedAt = new Date();
  let latestEventTimestampSeconds: number | null = null;
  const registeredHandlers = countRegisteredContractEventHandlers();
  const results: ContractEventProcessingResult[] = [];
  const seenFingerprints = new Set<string>();
  let accepted = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, normalized] of normalizedEvents.entries()) {
    if (!normalized.ok) {
      failed += 1;
      results.push({
        status: "failed",
        reason: normalized.reason,
      });
      logInternalEventError("event.failed", {
        index,
        reason: normalized.reason,
        code: normalized.code,
      });
      continue;
    }

    accepted += 1;
    const raw = normalized.raw;
    latestEventTimestampSeconds =
      latestEventTimestampSeconds === null
        ? raw.blockTimestamp
        : Math.max(latestEventTimestampSeconds, raw.blockTimestamp);

    if (raw.removed) {
      skipped += 1;
      results.push({
        status: "skipped",
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        reason: "removed_log",
      });
      continue;
    }

    if (seenFingerprints.has(normalized.fingerprint)) {
      skipped += 1;
      results.push({
        status: "skipped",
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        reason: "duplicate_event",
      });
      continue;
    }
    seenFingerprints.add(normalized.fingerprint);

    const contract = getRegisteredContract(raw.chainId, raw.contractAddress);
    if (!contract) {
      failed += 1;
      results.push({
        status: "failed",
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        reason: "Unknown contract address for chain.",
      });
      logInternalEventError("event.failed", {
        index,
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        logIndex: raw.logIndex,
        reason: "unknown_contract",
      });
      continue;
    }

    if (!hasRegisteredContractEventHandlers(contract.contractName)) {
      skipped += 1;
      results.push({
        status: "skipped",
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        contractName: contract.contractName,
        reason: "No event handlers are registered for this contract.",
      });
      continue;
    }

    const decoded = decodeContractEvent(contract, raw);
    if (!decoded) {
      failed += 1;
      results.push({
        status: "failed",
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        contractName: contract.contractName,
        reason: "Unable to decode raw contract log.",
      });
      logInternalEventError("event.failed", {
        index,
        fingerprint: normalized.fingerprint,
        chainId: raw.chainId,
        contractAddress: raw.contractAddress,
        contractName: contract.contractName,
        logIndex: raw.logIndex,
        reason: "undecodable_log",
      });
      continue;
    }

    const dispatchResult = await dispatchDecodedContractEvent(
      {
        chainTime: new Date(decoded.blockTimestamp * 1000),
        fingerprint: decoded.fingerprint,
        eventIndex: index,
        eventCount: normalizedEvents.length,
        contract,
        raw,
        logger: console,
      },
      decoded,
    );

    results.push(dispatchResult);
    if (dispatchResult.status === "processed") {
      processed += 1;
      continue;
    }

    if (dispatchResult.status === "skipped") {
      skipped += 1;
      continue;
    }

    failed += 1;
    logInternalEventError("event.failed", {
      index,
      fingerprint: dispatchResult.fingerprint,
      chainId: dispatchResult.chainId,
      contractAddress: dispatchResult.contractAddress,
      contractName: dispatchResult.contractName,
      eventName: dispatchResult.eventName,
      reason: dispatchResult.reason,
    });
  }

  const responseBody = {
    checkedAt: new Date(
      (latestEventTimestampSeconds ?? Math.floor(requestReceivedAt.getTime() / 1000)) * 1000,
    ).toISOString(),
    registeredHandlers,
    accepted,
    processed,
    skipped,
    failed,
    results,
  };

  if (accepted === 0) {
    return createNoStoreJsonResponse({
      ok: false,
      error: "No valid internal events were accepted.",
      ...responseBody,
    }, { status: 400 });
  }

  if (failed > 0) {
    return createNoStoreJsonResponse({
      ok: false,
      error: "One or more internal events failed and must be retried.",
      ...responseBody,
    }, { status: 500 });
  }

  return createNoStoreJsonResponse({
    ok: true,
    ...responseBody,
  });
}

export const POST = withNoStoreRouteErrorHandling("internal/events", postInternalEvents, {
  message: "Unable to process internal events.",
  status: 500,
  code: "EVENTS_FAILED",
});
