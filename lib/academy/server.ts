import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { pointsPrograms, pointsUserBalances, users, type PointsProgram } from "@/lib/db/schema";

import { ACADEMY_PROGRAM_SLUG, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE } from "./constants";
import type {
  AcademyLeaderboardEntry,
  AcademyLeaderboardPage,
  AcademySeason,
  AcademySummary,
  AcademySummaryUser,
} from "./types";

type JsonRecord = Record<string, unknown>;

type LeaderboardRow = {
  program_id: string;
  program_slug: string;
  program_name: string;
  program_kind: AcademySeason["kind"];
  program_status: AcademySeason["status"];
  user_id: string;
  wallet_address: string;
  wallet_address_normalized: string;
  display_name: string | null;
  avatar_url: string | null;
  current_points: string | number | bigint;
  lifetime_earned_points: string | number | bigint;
  lifetime_spent_points: string | number | bigint;
  entry_count: string | number | bigint;
  first_activity_at: string | null;
  last_activity_at: string | null;
  leaderboard_rank: string | number | bigint;
};

type ProgramUser = typeof users.$inferSelect;
type ProgramBalance = typeof pointsUserBalances.$inferSelect;

function asRecord(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

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

function toSeason(row: PointsProgram): AcademySeason {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: asRecord(row.metadata),
  };
}

function toSummaryUser(
  user: ProgramUser,
  balance: ProgramBalance | null,
  rank: number | null,
): AcademySummaryUser {
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    walletAddressNormalized: user.walletAddressNormalized,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    totalPoints: balance ? asNumber(balance.currentPoints) : 0,
    rank,
    lastActivityAt: balance?.lastActivityAt ?? null,
  };
}

function toLeaderboardEntry(row: LeaderboardRow, currentUserId?: string | null): AcademyLeaderboardEntry {
  return {
    userId: row.user_id,
    rank: asNumber(row.leaderboard_rank),
    walletAddress: row.wallet_address,
    walletAddressNormalized: row.wallet_address_normalized,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    totalPoints: asNumber(row.current_points),
    entryCount: asNumber(row.entry_count),
    firstActivityAt: row.first_activity_at,
    lastActivityAt: row.last_activity_at,
    isCurrentUser: currentUserId ? row.user_id === currentUserId : false,
  };
}

function normalizeLimit(limit: number, fallback: number): number {
  return Number.isInteger(limit) && limit > 0 ? limit : fallback;
}

function normalizePage(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function paginate(totalItems: number, limit: number): { totalPages: number } {
  return {
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
  };
}

async function resolveActiveAcademyProgram(): Promise<PointsProgram | null> {
  const academyProgram = await db
    .select()
    .from(pointsPrograms)
    .where(eq(pointsPrograms.slug, ACADEMY_PROGRAM_SLUG))
    .limit(1);

  const preferred = academyProgram[0];
  if (
    preferred?.status === "active" &&
    (preferred.kind === "season" || preferred.kind === "campaign")
  ) {
    return preferred;
  }

  const activePrograms = await db
    .select()
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.status, "active"),
        sql`${pointsPrograms.kind} in ('season', 'campaign')`,
      ),
    )
    .orderBy(desc(pointsPrograms.startsAt), desc(pointsPrograms.createdAt))
    .limit(1);

  return activePrograms[0] ?? null;
}

async function resolveAcademyUser(userId: string): Promise<ProgramUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

async function resolveAcademyBalance(
  programId: string,
  userId: string,
): Promise<ProgramBalance | null> {
  const rows = await db
    .select()
    .from(pointsUserBalances)
    .where(and(eq(pointsUserBalances.programId, programId), eq(pointsUserBalances.userId, userId)))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveAcademyLeaderboardRow(
  programSlug: string,
  userId: string,
): Promise<LeaderboardRow | null> {
  const rows = await db.execute(sql`
    select
      program_id,
      program_slug,
      program_name,
      program_kind,
      program_status,
      user_id,
      wallet_address,
      wallet_address_normalized,
      display_name,
      avatar_url,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
      first_activity_at,
      last_activity_at,
      leaderboard_rank
    from public.points_program_leaderboard
    where program_slug = ${programSlug}
      and user_id = ${userId}
    limit 1
  `);

  return (rows[0] as LeaderboardRow | undefined) ?? null;
}

async function resolveAcademyLeaderboardPage(
  programSlug: string,
  page: number,
  limit: number,
  currentUserId: string | null,
): Promise<AcademyLeaderboardPage> {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE);
  const offset = (normalizedPage - 1) * normalizedLimit;

  const rows = await db.execute(sql`
    select
      program_id,
      program_slug,
      program_name,
      program_kind,
      program_status,
      user_id,
      wallet_address,
      wallet_address_normalized,
      display_name,
      avatar_url,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
      first_activity_at,
      last_activity_at,
      leaderboard_rank
    from public.points_program_leaderboard
    where program_slug = ${programSlug}
    order by leaderboard_rank asc
    limit ${normalizedLimit} offset ${offset}
  `);

  const countRows = await db.execute(sql`
    select count(*)::bigint as total_items
    from public.points_program_leaderboard
    where program_slug = ${programSlug}
  `);

  const totalItems = asNumber((countRows[0] as { total_items?: unknown } | undefined)?.total_items, 0);
  const seasonRow = await resolveActiveAcademyProgram();

  return {
    season: seasonRow ? toSeason(seasonRow) : null,
    page: normalizedPage,
    limit: normalizedLimit,
    totalItems,
    ...paginate(totalItems, normalizedLimit),
    items: (rows as unknown as LeaderboardRow[]).map((row) => toLeaderboardEntry(row, currentUserId)),
  };
}

async function buildAcademySummary(input: {
  program: PointsProgram | null;
  userId: string | null;
  authenticated: boolean;
}): Promise<AcademySummary> {
  const serverTime = new Date().toISOString();
  const program = input.program;

  if (!program) {
    const user = input.userId ? await resolveAcademyUser(input.userId) : null;
    return {
      serverTime,
      authenticated: input.authenticated,
      season: null,
      user: user
        ? {
            id: user.id,
            walletAddress: user.walletAddress,
            walletAddressNormalized: user.walletAddressNormalized,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            totalPoints: 0,
            rank: null,
            lastActivityAt: null,
          }
        : null,
      totalPoints: 0,
      rank: null,
    };
  }

  const [leaderboardRow, userRow] = await Promise.all([
    input.userId ? resolveAcademyLeaderboardRow(program.slug, input.userId) : Promise.resolve(null),
    input.userId ? resolveAcademyUser(input.userId) : Promise.resolve(null),
  ]);

  const balance = input.userId ? await resolveAcademyBalance(program.id, input.userId) : null;
  const user = userRow
    ? toSummaryUser(
        userRow,
        balance,
        leaderboardRow ? asNumber(leaderboardRow.leaderboard_rank) : null,
      )
    : null;

  return {
    serverTime,
    authenticated: input.authenticated,
    season: toSeason(program),
    user,
    totalPoints: user?.totalPoints ?? 0,
    rank: user?.rank ?? null,
  };
}

export type AcademyService = {
  getSummary(userId: string | null): Promise<AcademySummary>;
  getLeaderboard(page: number, limit: number, userId: string | null): Promise<AcademyLeaderboardPage>;
};

export function createAcademyService(): AcademyService {
  return {
    async getSummary(userId) {
      const program = await resolveActiveAcademyProgram();
      return buildAcademySummary({
        program,
        userId,
        authenticated: Boolean(userId),
      });
    },
    async getLeaderboard(page, limit, userId) {
      const program = await resolveActiveAcademyProgram();
      if (!program) {
        return {
          season: null,
          page: normalizePage(page),
          limit: normalizeLimit(limit, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE),
          totalItems: 0,
          totalPages: 0,
          items: [],
        };
      }

      return resolveAcademyLeaderboardPage(program.slug, page, limit, userId);
    },
  };
}
