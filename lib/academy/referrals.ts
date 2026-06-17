import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  academyReferralCodes,
  academyReferralRelationships,
  type AcademyReferralCode,
  type AcademyReferralRelationship,
  users,
} from "@/lib/db/schema";

import {
  ACADEMY_POINTS_SCALE,
  ACADEMY_REFERRAL_CODE_LENGTH,
  ACADEMY_REFERRAL_DIRECT_PERCENT,
  ACADEMY_REFERRAL_GRAND_PERCENT,
  ACADEMY_REFERRAL_LINK_QUERY_PARAM,
  ACADEMY_REFERRAL_PENDING_COOKIE_NAME,
  ACADEMY_TASK_USER_PERCENT,
} from "./constants";
import {
  AcademyReferralAlreadyBoundError,
  AcademyReferralError,
  AcademyReferralNotFoundError,
} from "./tasks/errors";
import type { AcademyReferralSummary } from "./types";

type ProgramUser = typeof users.$inferSelect;

type ReferralChain = {
  directReferrerUserId: string | null;
  grandReferrerUserId: string | null;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function isValidAcademyReferralId(refId: string): boolean {
  return /^[A-Za-z0-9_-]{1,8}$/.test(refId.trim());
}

function normalizeReferralId(refId: string): string {
  return refId.trim();
}

function buildReferralSeed(input: {
  userId: string;
  walletAddressNormalized: string;
  chainId: number;
  attempt: number;
}): string {
  return [
    "academy",
    input.userId,
    input.walletAddressNormalized,
    input.chainId,
    input.attempt,
  ].join(":");
}

function generateReferralId(input: {
  userId: string;
  walletAddressNormalized: string;
  chainId: number;
  attempt: number;
}): string {
  return createHash("sha256")
    .update(buildReferralSeed(input))
    .digest("base64url")
    .slice(0, ACADEMY_REFERRAL_CODE_LENGTH);
}

function serializeReferralPendingCookie(input: { refId: string; chainId: number | null }): string {
  const params = new URLSearchParams();
  params.set("ref", normalizeReferralId(input.refId));
  if (typeof input.chainId === "number" && Number.isInteger(input.chainId) && input.chainId > 0) {
    params.set("chainId", String(input.chainId));
  }
  return params.toString();
}

function formatAcademyReferralUnits(units: bigint): string {
  const negative = units < 0n;
  const absoluteUnits = negative ? -units : units;
  const whole = absoluteUnits / BigInt(ACADEMY_POINTS_SCALE);
  const fraction = absoluteUnits % BigInt(ACADEMY_POINTS_SCALE);
  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(4, "0")}`;
}

export function parseReferralPendingCookie(value: string | null): {
  refId: string;
  chainId: number | null;
} | null {
  if (!value) {
    return null;
  }

  const params = new URLSearchParams(value);
  const refId = normalizeReferralId(params.get("ref") ?? "");
  if (!isValidAcademyReferralId(refId)) {
    return null;
  }

  const chainIdRaw = params.get("chainId");
  const chainId = chainIdRaw ? Number(chainIdRaw) : null;
  if (chainIdRaw !== null && (chainId === null || !Number.isInteger(chainId) || chainId <= 0)) {
    return null;
  }

  return {
    refId,
    chainId,
  };
}

export function createAcademyReferralPendingCookieOptions() {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    name: ACADEMY_REFERRAL_PENDING_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function clearAcademyReferralPendingCookieOptions() {
  return {
    ...createAcademyReferralPendingCookieOptions(),
    value: "",
    expires: new Date(0),
    maxAge: 0,
  };
}

async function resolveAcademyUserById(userId: string): Promise<ProgramUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

async function resolveAcademyReferralCodeByUserAndChain(
  client: typeof db,
  userId: string,
  chainId: number,
): Promise<AcademyReferralCode | null> {
  const rows = await client
    .select()
    .from(academyReferralCodes)
    .where(and(eq(academyReferralCodes.userId, userId), eq(academyReferralCodes.chainId, chainId)))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveAcademyReferralCodeByRefId(
  client: typeof db,
  refId: string,
): Promise<AcademyReferralCode | null> {
  const rows = await client
    .select()
    .from(academyReferralCodes)
    .where(eq(academyReferralCodes.refId, normalizeReferralId(refId)))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveAcademyReferralChain(
  client: typeof db,
  userId: string,
  chainId: number,
): Promise<ReferralChain> {
  const rows = await client.execute(sql`
    select
      direct.referrer_user_id as direct_referrer_user_id,
      grand.referrer_user_id as grand_referrer_user_id
    from public.academy_referral_relationships direct
    left join public.academy_referral_relationships grand
      on grand.referred_user_id = direct.referrer_user_id
      and grand.chain_id = direct.chain_id
    where direct.referred_user_id = ${userId}
      and direct.chain_id = ${chainId}
    limit 1
  `);

  const row = rows[0] as {
    direct_referrer_user_id?: string | null;
    grand_referrer_user_id?: string | null;
  } | undefined;

  return {
    directReferrerUserId: row?.direct_referrer_user_id ?? null,
    grandReferrerUserId: row?.grand_referrer_user_id ?? null,
  };
}

export async function resolveAcademyReferralRecipients(
  client: typeof db,
  input: {
    userId: string;
    chainId: number;
  },
): Promise<ReferralChain> {
  return resolveAcademyReferralChain(client, input.userId, input.chainId);
}

async function countAcademyDirectReferrals(
  client: typeof db,
  input: {
    userId: string;
    chainId: number;
  },
): Promise<number> {
  const rows = await client.execute(sql`
    select count(*)::bigint as total_items
    from public.academy_referral_relationships
    where referrer_user_id = ${input.userId}
      and chain_id = ${input.chainId}
  `);

  return asNumber((rows[0] as { total_items?: unknown } | undefined)?.total_items, 0);
}

async function countAcademyGrandReferrals(
  client: typeof db,
  input: {
    userId: string;
    chainId: number;
  },
): Promise<number> {
  const rows = await client.execute(sql`
    select count(*)::bigint as total_items
    from public.academy_referral_relationships grand
    join public.academy_referral_relationships direct
      on direct.referred_user_id = grand.referrer_user_id
      and direct.chain_id = grand.chain_id
    where direct.referrer_user_id = ${input.userId}
      and direct.chain_id = ${input.chainId}
      and grand.chain_id = ${input.chainId}
  `);

  return asNumber((rows[0] as { total_items?: unknown } | undefined)?.total_items, 0);
}

async function ensureAcademyReferralCode(
  client: typeof db,
  input: {
    user: ProgramUser;
    chainId: number;
  },
): Promise<AcademyReferralCode> {
  const existing = await resolveAcademyReferralCodeByUserAndChain(client, input.user.id, input.chainId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const refId = generateReferralId({
      userId: input.user.id,
      walletAddressNormalized: input.user.walletAddressNormalized,
      chainId: input.chainId,
      attempt,
    });

    const rows = await client
      .insert(academyReferralCodes)
      .values({
        userId: input.user.id,
        chainId: input.chainId,
        refId,
      })
      .onConflictDoNothing()
      .returning();

    if (rows[0]) {
      return rows[0];
    }

    const current = await resolveAcademyReferralCodeByUserAndChain(client, input.user.id, input.chainId);
    if (current) {
      return current;
    }

    const conflictingCode = await resolveAcademyReferralCodeByRefId(client, refId);
    if (!conflictingCode) {
      continue;
    }
  }

  throw new AcademyReferralError("Unable to generate a unique Academy referral code.");
}

export async function resolveAcademyReferralSummary(
  client: typeof db,
  input: {
    userId: string | null;
    chainId: number | null;
    origin: string;
  },
): Promise<AcademyReferralSummary> {
  if (!input.userId || !input.chainId) {
    return {
      refId: null,
      referralLink: null,
      directCount: 0,
      grandCount: 0,
    };
  }

  const user = await resolveAcademyUserById(input.userId);
  if (!user) {
    return {
      refId: null,
      referralLink: null,
      directCount: 0,
      grandCount: 0,
    };
  }

  const referralCode = await ensureAcademyReferralCode(client, {
    user,
    chainId: input.chainId,
  });

  const [directCount, grandCount] = await Promise.all([
    countAcademyDirectReferrals(client, {
      userId: input.userId,
      chainId: input.chainId,
    }),
    countAcademyGrandReferrals(client, {
      userId: input.userId,
      chainId: input.chainId,
    }),
  ]);

  const referralUrl = new URL("/academy", input.origin);
  referralUrl.searchParams.set(ACADEMY_REFERRAL_LINK_QUERY_PARAM, referralCode.refId);
  referralUrl.searchParams.set("chainId", String(input.chainId));

  return {
    refId: referralCode.refId,
    referralLink: referralUrl.toString(),
    directCount,
    grandCount,
  };
}

export async function bindAcademyReferral(
  client: typeof db,
  input: {
    referredUserId: string;
    chainId: number;
    refId: string;
  },
): Promise<AcademyReferralRelationship> {
  const normalizedRefId = normalizeReferralId(input.refId);
  if (!isValidAcademyReferralId(normalizedRefId)) {
    throw new AcademyReferralError("Referral code is invalid.");
  }

  const referrerCode = await resolveAcademyReferralCodeByRefId(client, normalizedRefId);
  if (!referrerCode) {
    throw new AcademyReferralNotFoundError("Referral code was not found.");
  }

  if (referrerCode.chainId !== input.chainId) {
    throw new AcademyReferralError("Referral code does not match the authenticated chain.");
  }

  if (referrerCode.userId === input.referredUserId) {
    throw new AcademyReferralError("You cannot refer your own wallet.");
  }

  const existing = await client
    .select()
    .from(academyReferralRelationships)
    .where(
      and(
        eq(academyReferralRelationships.referredUserId, input.referredUserId),
        eq(academyReferralRelationships.chainId, input.chainId),
      ),
    )
    .limit(1);

  const current = existing[0];
  if (current) {
    if (current.referrerUserId === referrerCode.userId) {
      return current;
    }

    throw new AcademyReferralAlreadyBoundError("This wallet already has a referral binding for the current chain.");
  }

  const rows = await client
    .insert(academyReferralRelationships)
    .values({
      referredUserId: input.referredUserId,
      referrerUserId: referrerCode.userId,
      chainId: input.chainId,
      refId: normalizedRefId,
    })
    .onConflictDoNothing()
    .returning();

  if (rows[0]) {
    return rows[0];
  }

  const rebound = await client
    .select()
    .from(academyReferralRelationships)
    .where(
      and(
        eq(academyReferralRelationships.referredUserId, input.referredUserId),
        eq(academyReferralRelationships.chainId, input.chainId),
      ),
    )
    .limit(1);

  if (rebound[0]) {
    if (rebound[0].referrerUserId === referrerCode.userId) {
      return rebound[0];
    }

    throw new AcademyReferralAlreadyBoundError("This wallet already has a referral binding for the current chain.");
  }

  throw new AcademyReferralError("Failed to bind Academy referral.");
}

export function createAcademyReferralPendingCookie(input: {
  refId: string;
  chainId: number | null;
}): {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  expires: Date;
  maxAge: number;
} {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    name: ACADEMY_REFERRAL_PENDING_COOKIE_NAME,
    value: serializeReferralPendingCookie(input),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function createClearedAcademyReferralPendingCookie(): ReturnType<
  typeof createAcademyReferralPendingCookieOptions
> {
  return {
    name: ACADEMY_REFERRAL_PENDING_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}

export function toAcademyReferralUnits(value: number | string | bigint): bigint {
  if (typeof value === "bigint") {
    return value * BigInt(ACADEMY_POINTS_SCALE);
  }

  const raw = typeof value === "number" ? value.toFixed(4) : String(value).trim();
  if (!raw) {
    return 0n;
  }

  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  const paddedFraction = `${fractionPart}0000`.slice(0, 4);
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(paddedFraction);
  const units = whole * BigInt(ACADEMY_POINTS_SCALE) + fraction;
  return negative ? -units : units;
}

export function formatAcademyReferralPoints(value: number | string | bigint): string {
  if (typeof value === "bigint") {
    return formatAcademyReferralUnits(value);
  }

  return formatAcademyReferralUnits(toAcademyReferralUnits(value));
}

export function splitAcademyReferralPoints(basePoints: number | string | bigint): {
  userPoints: string;
  directReferralPoints: string | null;
  grandReferralPoints: string | null;
} {
  const baseUnits = toAcademyReferralUnits(basePoints);
  const userUnits = (baseUnits * BigInt(ACADEMY_TASK_USER_PERCENT) + 50n) / 100n;
  const directUnits = (baseUnits * BigInt(ACADEMY_REFERRAL_DIRECT_PERCENT) + 50n) / 100n;
  const grandUnits = (baseUnits * BigInt(ACADEMY_REFERRAL_GRAND_PERCENT) + 50n) / 100n;

  return {
    userPoints: formatAcademyReferralPoints(userUnits),
    directReferralPoints: directUnits > 0n ? formatAcademyReferralPoints(directUnits) : null,
    grandReferralPoints: grandUnits > 0n ? formatAcademyReferralPoints(grandUnits) : null,
  };
}
