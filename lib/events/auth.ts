import type { NextRequest } from "next/server";

import {
  extractBearerToken,
  getRequiredServerSecret,
  getTrimmedHeaderValue,
  timingSafeEqualString,
} from "@/lib/internal-auth";

const DEFAULT_EVENT_AUTH_HEADER = "x-aurove-webhook-secret";

export function getInternalEventAuthHeaderName(): string {
  return process.env.EVENTS_WEBHOOK_AUTH_HEADER?.trim() || DEFAULT_EVENT_AUTH_HEADER;
}

export function verifyInternalEventsRequest(request: NextRequest): {
  ok: true;
  secretSource: "authorization" | "header";
} | {
  ok: false;
  status: number;
  code: string;
  message: string;
} {
  let expectedSecret: string;
  try {
    expectedSecret = getRequiredServerSecret("EVENTS_WEBHOOK_SECRET");
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "EVENTS_AUTH_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Events auth is unavailable.",
    };
  }

  const candidates: Array<{ source: "authorization" | "header"; value: string }> = [];

  const bearerToken = extractBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    candidates.push({ source: "authorization", value: bearerToken });
  }

  const eventAuthHeaderName = getInternalEventAuthHeaderName();
  const headerSecret = getTrimmedHeaderValue(request, eventAuthHeaderName);
  if (headerSecret) {
    candidates.push({ source: "header", value: headerSecret });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 401,
      code: "EVENTS_AUTH_REQUIRED",
      message: "Missing event authentication credentials.",
    };
  }

  for (const candidate of candidates) {
    if (timingSafeEqualString(candidate.value, expectedSecret)) {
      return {
        ok: true,
        secretSource: candidate.source,
      };
    }
  }

  return {
    ok: false,
    status: 401,
    code: "EVENTS_AUTH_INVALID",
    message: "Invalid event authentication credentials.",
  };
}
