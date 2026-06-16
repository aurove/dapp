import { createHash, randomBytes } from "node:crypto";

import {
  WALLET_AUTH_SESSION_COOKIE_NAME,
  WALLET_AUTH_SESSION_RENEWAL_WINDOW_MS,
  WALLET_AUTH_SESSION_TTL_MS,
} from "./constants";

export { WALLET_AUTH_SESSION_COOKIE_NAME } from "./constants";

export function createWalletAuthSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashWalletAuthSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createWalletAuthSessionCookieOptions(expiresAt: Date) {
  return {
    name: WALLET_AUTH_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function createWalletAuthSessionExpiration(now = Date.now()) {
  return new Date(now + WALLET_AUTH_SESSION_TTL_MS);
}

export function shouldRenewWalletAuthSession(expiresAt: string | Date, now = Date.now()) {
  const expiresAtMs = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs - now <= WALLET_AUTH_SESSION_RENEWAL_WINDOW_MS;
}
