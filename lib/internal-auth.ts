import crypto from "node:crypto";

import type { NextRequest } from "next/server";

export function getRequiredServerSecret(
  envName: string,
  options?: {
    minLength?: number;
  },
): string {
  const value = process.env[envName]?.trim();
  if (!value) {
    throw new Error(`${envName} is not configured.`);
  }

  if ((options?.minLength ?? 0) > 0 && value.length < (options?.minLength ?? 0)) {
    throw new Error(`${envName} must be at least ${options?.minLength} characters long.`);
  }

  return value;
}

function hashUtf8(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function timingSafeEqualString(left: string, right: string): boolean {
  return crypto.timingSafeEqual(hashUtf8(left), hashUtf8(right));
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function getTrimmedHeaderValue(request: NextRequest, headerName: string): string | null {
  const value = request.headers.get(headerName)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, ...rest] = headerValue.split(/\s+/);
  if (!scheme || rest.length === 0) {
    return null;
  }

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}
