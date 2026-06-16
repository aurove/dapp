import { randomBytes } from "node:crypto";

import { verifyMessage, type Address } from "viem";

import { getSupabaseAdminClient } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";

import { WALLET_AUTH_CHALLENGE_TTL_MS } from "./constants";
import { buildWalletAuthMessage, formatWalletAddress, normalizeWalletAddress, parseWalletAuthMessage } from "./utils";
import {
  createWalletAuthSessionExpiration,
  createWalletAuthSessionToken,
  hashWalletAuthSessionToken,
} from "./session";
import type {
  WalletAuthChallenge,
  WalletAuthSession,
  WalletAuthUser,
} from "./types";

type SupabaseTables = Database["public"]["Tables"];

type UserRow = SupabaseTables["users"]["Row"];
type ChallengeRow = SupabaseTables["auth_challenges"]["Row"];
type SessionRow = SupabaseTables["auth_sessions"]["Row"];

type ChallengeInput = {
  walletAddressNormalized: string;
  chainId: number;
};

type VerifyWalletInput = {
  walletAddress: string;
  chainId: number;
  message: string;
  signature: `0x${string}`;
  origin: string;
};

function mapUser(row: UserRow): WalletAuthUser {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    walletAddressNormalized: row.wallet_address_normalized,
    chainId: row.chain_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChallenge(row: ChallengeRow): WalletAuthChallenge {
  return {
    id: row.id,
    walletAddressNormalized: row.wallet_address_normalized,
    chainId: row.chain_id,
    nonce: row.nonce,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

function mapSession(row: SessionRow): WalletAuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    walletAddressNormalized: row.wallet_address_normalized,
    chainId: row.chain_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

function getAdminClient() {
  return getSupabaseAdminClient();
}

function createNonce(): string {
  return randomBytes(16).toString("hex");
}

export async function findRecentActiveChallenge(
  walletAddressNormalized: string,
  chainId: number,
): Promise<WalletAuthChallenge | null> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("auth_challenges")
    .select("*")
    .eq("wallet_address_normalized", walletAddressNormalized)
    .eq("chain_id", chainId)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ? mapChallenge(data[0] as ChallengeRow) : null;
}

export async function createWalletAuthChallengeRecord(
  input: ChallengeInput,
): Promise<WalletAuthChallenge> {
  const supabase = getAdminClient();
  const expiresAt = new Date(Date.now() + WALLET_AUTH_CHALLENGE_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  const nonce = createNonce();

  const { data, error } = await supabase
    .from("auth_challenges")
    .insert({
      wallet_address_normalized: input.walletAddressNormalized,
      chain_id: input.chainId,
      nonce,
      expires_at: expiresAt,
      created_at: createdAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapChallenge(data as ChallengeRow);
}

export async function getOrCreateWalletAuthChallenge(
  input: ChallengeInput,
): Promise<WalletAuthChallenge> {
  const existing = await findRecentActiveChallenge(input.walletAddressNormalized, input.chainId);
  if (existing && Date.parse(existing.expiresAt) - Date.now() > 60_000) {
    return existing;
  }

  return createWalletAuthChallengeRecord(input);
}

export function formatWalletAuthChallengeMessage(
  challenge: WalletAuthChallenge,
  origin: string,
  walletAddress: string,
): string {
  return buildWalletAuthMessage({
    walletAddress: formatWalletAddress(walletAddress),
    chainId: challenge.chainId,
    nonce: challenge.nonce,
    issuedAt: challenge.createdAt,
    expirationTime: challenge.expiresAt,
    origin,
  });
}

export async function upsertWalletAuthUser(input: {
  walletAddress: string;
  walletAddressNormalized: string;
  chainId: number;
}): Promise<WalletAuthUser> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        wallet_address: formatWalletAddress(input.walletAddress),
        wallet_address_normalized: input.walletAddressNormalized,
        chain_id: input.chainId,
        last_login_at: now,
      },
      { onConflict: "wallet_address_normalized" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapUser(data as UserRow);
}

export async function markChallengeUsed(challengeId: string): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("auth_challenges")
    .update({ used_at: now })
    .eq("id", challengeId)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Challenge has already been used.");
  }
}

export async function findWalletAuthChallengeByNonce(input: {
  walletAddressNormalized: string;
  chainId: number;
  nonce: string;
}): Promise<WalletAuthChallenge | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("auth_challenges")
    .select("*")
    .eq("wallet_address_normalized", input.walletAddressNormalized)
    .eq("chain_id", input.chainId)
    .eq("nonce", input.nonce)
    .is("used_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapChallenge(data as ChallengeRow) : null;
}

export async function createWalletAuthSessionRecord(input: {
  userId: string;
  walletAddressNormalized: string;
  chainId: number;
}): Promise<{ session: WalletAuthSession; token: string }> {
  const supabase = getAdminClient();
  const token = createWalletAuthSessionToken();
  const tokenHash = hashWalletAuthSessionToken(token);
  const expiresAt = createWalletAuthSessionExpiration().toISOString();
  const now = new Date().toISOString();

  const { data: sessionData, error: sessionError } = await supabase
    .from("auth_sessions")
    .insert({
      user_id: input.userId,
      wallet_address_normalized: input.walletAddressNormalized,
      chain_id: input.chainId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      last_seen_at: now,
    })
    .select("*")
    .single();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const { error: revokeError } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: now })
    .eq("wallet_address_normalized", input.walletAddressNormalized)
    .is("revoked_at", null)
    .neq("id", (sessionData as SessionRow).id);

  if (revokeError) {
    throw new Error(revokeError.message);
  }

  return {
    session: mapSession(sessionData as SessionRow),
    token,
  };
}

export async function getWalletAuthSessionByTokenHash(tokenHash: string) {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapSession(data as SessionRow) : null;
}

export async function getWalletAuthSessionWithUserByTokenHash(tokenHash: string): Promise<{
  session: WalletAuthSession;
  user: WalletAuthUser;
} | null> {
  const session = await getWalletAuthSessionByTokenHash(tokenHash);
  if (!session) {
    return null;
  }

  const supabase = getAdminClient();
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.userId)
    .maybeSingle();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData) {
    return null;
  }

  return {
    session,
    user: mapUser(userData as UserRow),
  };
}

export async function rotateWalletAuthSessionToken(tokenHash: string): Promise<{
  token: string;
  session: WalletAuthSession;
} | null> {
  const supabase = getAdminClient();
  const current = await getWalletAuthSessionByTokenHash(tokenHash);
  if (!current) {
    return null;
  }

  const token = createWalletAuthSessionToken();
  const nextHash = hashWalletAuthSessionToken(token);
  const expiresAt = createWalletAuthSessionExpiration().toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("auth_sessions")
    .update({
      token_hash: nextHash,
      expires_at: expiresAt,
      last_seen_at: now,
    })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    token,
    session: mapSession(data as SessionRow),
  };
}

export async function revokeWalletAuthSessionByTokenHash(tokenHash: string): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: now })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function revokeWalletAuthSessionsForWallet(walletAddressNormalized: string): Promise<void> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("auth_sessions")
    .update({ revoked_at: now })
    .eq("wallet_address_normalized", walletAddressNormalized)
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function verifyWalletAuthSignature({
  walletAddress,
  chainId,
  message,
  signature,
  origin,
}: VerifyWalletInput): Promise<{
  user: WalletAuthUser;
  session: WalletAuthSession;
  token: string;
}> {
  const parsedMessage = parseWalletAuthMessage(message);
  if (!parsedMessage) {
    throw new Error("Invalid authentication message.");
  }

  const normalizedWalletFromInput = normalizeWalletAddress(walletAddress);
  const normalizedWalletFromMessage = normalizeWalletAddress(parsedMessage.walletAddress);

  if (normalizedWalletFromInput !== normalizedWalletFromMessage) {
    throw new Error("Wallet address does not match the signed message.");
  }

  if (parsedMessage.chainId !== chainId) {
    throw new Error("Chain ID does not match the signed message.");
  }

  if (parsedMessage.uri !== origin) {
    throw new Error("Authentication message origin does not match this app.");
  }

  const challenge = await findWalletAuthChallengeByNonce({
    walletAddressNormalized: normalizedWalletFromInput,
    chainId,
    nonce: parsedMessage.nonce,
  });

  if (!challenge) {
    throw new Error("Challenge not found or already used.");
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    throw new Error("Challenge has expired.");
  }

  const expectedMessage = buildWalletAuthMessage({
    walletAddress: formatWalletAddress(walletAddress),
    chainId,
    nonce: challenge.nonce,
    issuedAt: challenge.createdAt,
    expirationTime: challenge.expiresAt,
    origin,
  });

  if (expectedMessage !== message) {
    throw new Error("Authentication message does not match the stored challenge.");
  }

  const isValid = await verifyMessage({
    address: formatWalletAddress(walletAddress) as Address,
    message,
    signature,
  });

  if (!isValid) {
    throw new Error("Signature verification failed.");
  }

  await markChallengeUsed(challenge.id);

  const user = await upsertWalletAuthUser({
    walletAddress,
    walletAddressNormalized: normalizedWalletFromInput,
    chainId,
  });

  await revokeWalletAuthSessionsForWallet(normalizedWalletFromInput);

  const { session, token } = await createWalletAuthSessionRecord({
    userId: user.id,
    walletAddressNormalized: normalizedWalletFromInput,
    chainId,
  });

  return { user, session, token };
}
