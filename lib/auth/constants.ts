export const WALLET_AUTH_SESSION_COOKIE_NAME = "aurove_wallet_auth_session";

export const WALLET_AUTH_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const WALLET_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const WALLET_AUTH_SESSION_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export const WALLET_AUTH_NONCE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const WALLET_AUTH_NONCE_RATE_LIMIT_CAPACITY = 4;

export const WALLET_AUTH_STATEMENT =
  "Sign this message to prove wallet ownership and start a secure Aurove session.";

