import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RPC_SESSION_COOKIE_NAME = "aurove_rpc_session";
const RPC_SESSION_TTL_SECONDS = 10 * 60;

function getSessionSecret(): string {
  const secret = process.env.SPECTRUM_RPC_SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error("SPECTRUM_RPC_SESSION_SECRET must be set and at least 32 characters long.");
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

export function createRpcSessionToken(now = Math.floor(Date.now() / 1000)): string {
  const expiresAt = now + RPC_SESSION_TTL_SECONDS;
  const nonce = randomBytes(12).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifyRpcSessionToken(
  token: string | undefined,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!token) return false;
  const [expiresAtRaw, nonce, signature] = token.split(".");
  if (!expiresAtRaw || !nonce || !signature) return false;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isInteger(expiresAt) || now >= expiresAt) return false;

  const payload = `${expiresAtRaw}.${nonce}`;
  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function getRpcSessionTtlSeconds(): number {
  return RPC_SESSION_TTL_SECONDS;
}
