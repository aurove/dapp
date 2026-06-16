import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { verifyMessage, type Address } from "viem";

import { db } from "@/lib/db";
import {
  authChallenges,
  authSessions,
  type AuthChallenge,
  type AuthSession,
  type User,
  users,
} from "@/lib/db/auth-schema";

import { WALLET_AUTH_CHALLENGE_TTL_MS } from "./constants";
import {
  buildWalletAuthMessage,
  formatWalletAddress,
  normalizeWalletAddress,
  parseWalletAuthMessage,
} from "./utils";
import {
  createWalletAuthSessionExpiration,
  createWalletAuthSessionToken,
  hashWalletAuthSessionToken,
} from "./session";
import type { WalletAuthChallenge, WalletAuthSession, WalletAuthUser } from "./types";

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

function mapUser(row: User): WalletAuthUser {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    walletAddressNormalized: row.walletAddressNormalized,
    chainId: row.chainId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapChallenge(row: AuthChallenge): WalletAuthChallenge {
  return {
    id: row.id,
    walletAddressNormalized: row.walletAddressNormalized,
    chainId: row.chainId,
    nonce: row.nonce,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function mapSession(row: AuthSession): WalletAuthSession {
  return {
    id: row.id,
    userId: row.userId,
    walletAddressNormalized: row.walletAddressNormalized,
    chainId: row.chainId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

function createNonce(): string {
  return randomBytes(16).toString("hex");
}

export async function findRecentActiveChallenge(
  walletAddressNormalized: string,
  chainId: number,
): Promise<WalletAuthChallenge | null> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.walletAddressNormalized, walletAddressNormalized),
        eq(authChallenges.chainId, chainId),
        isNull(authChallenges.usedAt),
        gt(authChallenges.expiresAt, now),
      ),
    )
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);

  return rows[0] ? mapChallenge(rows[0]) : null;
}

export async function createWalletAuthChallengeRecord(
  input: ChallengeInput,
): Promise<WalletAuthChallenge> {
  const expiresAt = new Date(Date.now() + WALLET_AUTH_CHALLENGE_TTL_MS).toISOString();
  const createdAt = new Date().toISOString();
  const nonce = createNonce();

  const rows = await db
    .insert(authChallenges)
    .values({
      walletAddressNormalized: input.walletAddressNormalized,
      chainId: input.chainId,
      nonce,
      expiresAt,
      createdAt,
    })
    .returning();

  const challenge = rows[0];
  if (!challenge) {
    throw new Error("Failed to create wallet auth challenge.");
  }

  return mapChallenge(challenge);
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
  const now = new Date().toISOString();
  const rows = await db
    .insert(users)
    .values({
      walletAddress: formatWalletAddress(input.walletAddress),
      walletAddressNormalized: input.walletAddressNormalized,
      chainId: input.chainId,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.walletAddressNormalized,
      set: {
        walletAddress: formatWalletAddress(input.walletAddress),
        chainId: input.chainId,
        lastLoginAt: now,
      },
    })
    .returning();

  const user = rows[0];
  if (!user) {
    throw new Error("Failed to upsert wallet auth user.");
  }

  return mapUser(user);
}

export async function markChallengeUsed(challengeId: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await db
    .update(authChallenges)
    .set({ usedAt: now })
    .where(and(eq(authChallenges.id, challengeId), isNull(authChallenges.usedAt)))
    .returning({ id: authChallenges.id });

  if (!rows[0]) {
    throw new Error("Challenge has already been used.");
  }
}

export async function findWalletAuthChallengeByNonce(input: {
  walletAddressNormalized: string;
  chainId: number;
  nonce: string;
}): Promise<WalletAuthChallenge | null> {
  const rows = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.walletAddressNormalized, input.walletAddressNormalized),
        eq(authChallenges.chainId, input.chainId),
        eq(authChallenges.nonce, input.nonce),
        isNull(authChallenges.usedAt),
      ),
    )
    .limit(1);

  return rows[0] ? mapChallenge(rows[0]) : null;
}

export async function createWalletAuthSessionRecord(input: {
  userId: string;
  walletAddressNormalized: string;
  chainId: number;
}): Promise<{ session: WalletAuthSession; token: string }> {
  const token = createWalletAuthSessionToken();
  const tokenHash = hashWalletAuthSessionToken(token);
  const expiresAt = createWalletAuthSessionExpiration().toISOString();
  const now = new Date().toISOString();

  const sessionRows = await db
    .insert(authSessions)
    .values({
      userId: input.userId,
      walletAddressNormalized: input.walletAddressNormalized,
      chainId: input.chainId,
      tokenHash,
      expiresAt,
      lastSeenAt: now,
    })
    .returning();

  const session = sessionRows[0];
  if (!session) {
    throw new Error("Failed to create wallet auth session.");
  }

  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.walletAddressNormalized, input.walletAddressNormalized),
        isNull(authSessions.revokedAt),
        ne(authSessions.id, session.id),
      ),
    );

  return {
    session: mapSession(session),
    token,
  };
}

export async function getWalletAuthSessionByTokenHash(tokenHash: string) {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .limit(1);

  return rows[0] ? mapSession(rows[0]) : null;
}

export async function getWalletAuthSessionWithUserByTokenHash(tokenHash: string): Promise<{
  session: WalletAuthSession;
  user: WalletAuthUser;
} | null> {
  const session = await getWalletAuthSessionByTokenHash(tokenHash);
  if (!session) {
    return null;
  }

  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = rows[0];

  if (!user) {
    return null;
  }

  return {
    session,
    user: mapUser(user),
  };
}

export async function rotateWalletAuthSessionToken(tokenHash: string): Promise<{
  token: string;
  session: WalletAuthSession;
} | null> {
  const current = await getWalletAuthSessionByTokenHash(tokenHash);
  if (!current) {
    return null;
  }

  const token = createWalletAuthSessionToken();
  const nextHash = hashWalletAuthSessionToken(token);
  const expiresAt = createWalletAuthSessionExpiration().toISOString();
  const now = new Date().toISOString();

  const rows = await db
    .update(authSessions)
    .set({
      tokenHash: nextHash,
      expiresAt,
      lastSeenAt: now,
    })
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)))
    .returning();

  return {
    token,
    session: mapSession(rows[0]),
  };
}

export async function revokeWalletAuthSessionByTokenHash(tokenHash: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
}

export async function revokeWalletAuthSessionsForWallet(
  walletAddressNormalized: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.walletAddressNormalized, walletAddressNormalized),
        isNull(authSessions.revokedAt),
      ),
    );
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
