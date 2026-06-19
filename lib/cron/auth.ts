import crypto from "node:crypto";

import type { NextRequest } from "next/server";

import {
  getRequiredServerSecret,
  timingSafeEqualHex,
} from "@/lib/internal-auth";

const CRON_HMAC_PREFIX = "v1=";
const MAX_CLOCK_SKEW_SECONDS = 300;
const TIMESTAMP_HEADER = "x-aurove-cron-timestamp";
const SIGNATURE_HEADER = "x-aurove-cron-signature";

function getCronInternalSecret(): string {
  return getRequiredServerSecret("CRON_INTERNAL_SECRET", {
    minLength: 32,
  });
}

export function signCronRequest(input: {
  method: string;
  pathname: string;
  timestamp: string;
  rawBody: string;
}): string {
  const secret = getCronInternalSecret();
  const payload = `${input.timestamp}.${input.method.toUpperCase()}.${input.pathname}.${input.rawBody}`;
  const digest = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${CRON_HMAC_PREFIX}${digest}`;
}

export function verifyCronRequest(request: NextRequest, rawBody: string): {
  ok: true;
  timestamp: number;
} | {
  ok: false;
  status: number;
  code: string;
  message: string;
} {
  let secret: string;
  try {
    secret = getCronInternalSecret();
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "CRON_AUTH_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Cron auth is unavailable.",
    };
  }

  const timestampRaw = request.headers.get(TIMESTAMP_HEADER)?.trim() ?? "";
  const signatureRaw = request.headers.get(SIGNATURE_HEADER)?.trim() ?? "";

  if (!timestampRaw || !signatureRaw) {
    return {
      ok: false,
      status: 401,
      code: "CRON_AUTH_REQUIRED",
      message: "Missing cron authentication headers.",
    };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return {
      ok: false,
      status: 401,
      code: "CRON_AUTH_INVALID",
      message: "Invalid cron timestamp.",
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return {
      ok: false,
      status: 401,
      code: "CRON_AUTH_EXPIRED",
      message: "Cron request timestamp is outside the allowed window.",
    };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestampRaw}.${request.method.toUpperCase()}.${request.nextUrl.pathname}.${rawBody}`)
    .digest("hex");

  const provided = signatureRaw.startsWith(CRON_HMAC_PREFIX)
    ? signatureRaw.slice(CRON_HMAC_PREFIX.length)
    : signatureRaw;

  if (!timingSafeEqualHex(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "CRON_AUTH_INVALID",
      message: "Invalid cron signature.",
    };
  }

  return {
    ok: true,
    timestamp,
  };
}
