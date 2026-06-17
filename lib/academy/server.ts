import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { pointsPrograms, pointsUserBalances, users, type PointsProgram } from "@/lib/db/schema";
import { normalizeWalletAddress } from "@/lib/auth/utils";

import { DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE } from "./constants";
import { runAcademyTask } from "./tasks";
import { AcademyActivityUserNotFoundError } from "./tasks/errors";
import { resolveActiveAcademyProgram } from "./tasks/points";
import type {
  AcademyActivityEntry,
  AcademyActivityPage,
  AcademyActivityUser,
  AcademyCheckInState,
  AcademyLeaderboardEntry,
  AcademyLeaderboardPage,
  AcademySeason,
  AcademySummary,
} from "./types";

type JsonRecord = Record<string, unknown>;

type LeaderboardRow = {
  user_id: string;
  wallet_address: string;
  current_points: string | number | bigint;
  lifetime_earned_points: string | number | bigint;
  lifetime_spent_points: string | number | bigint;
  entry_count: string | number | bigint;
  leaderboard_rank: string | number | bigint;
};

type ActivityRow = {
  id: string;
  activity_definition_id: string;
  activity_code: string;
  activity_name: string;
  source_kind: string;
  source_reference: string | null;
  source_details: JsonRecord;
  points_delta: string | number | bigint;
  occurred_at: string;
  recorded_at: string;
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

function toLeaderboardEntry(row: LeaderboardRow, currentUserId?: string | null): AcademyLeaderboardEntry {
  return {
    userId: row.user_id,
    rank: asNumber(row.leaderboard_rank),
    walletAddress: row.wallet_address,
    totalPoints: asNumber(row.current_points),
    entryCount: asNumber(row.entry_count),
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

async function resolveAcademyUser(userId: string): Promise<ProgramUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

async function resolveAcademyUserByWalletAddress(walletAddress: string): Promise<ProgramUser | null> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.walletAddressNormalized, normalizedWalletAddress))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveAcademyProgramById(programId: string): Promise<PointsProgram | null> {
  const rows = await db.select().from(pointsPrograms).where(eq(pointsPrograms.id, programId)).limit(1);
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

function toActivityUser(
  user: ProgramUser,
  balance: ProgramBalance | null,
  rank: number | null,
  currentUserId: string | null,
): AcademyActivityUser {
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    totalPoints: balance ? asNumber(balance.currentPoints) : 0,
    rank,
    isCurrentUser: currentUserId ? user.id === currentUserId : false,
  };
}

function toActivityEntry(row: ActivityRow): AcademyActivityEntry {
  return {
    id: row.id,
    activityDefinitionId: row.activity_definition_id,
    activityCode: row.activity_code,
    activityName: row.activity_name,
    sourceKind: row.source_kind,
    sourceReference: row.source_reference,
    sourceDetails: asRecord(row.source_details),
    pointsDelta: asNumber(row.points_delta),
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
  };
}

async function resolveAcademyLeaderboardRow(
  programSlug: string,
  userId: string,
): Promise<LeaderboardRow | null> {
  const rows = await db.execute(sql`
    select
      user_id,
      wallet_address,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
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
      user_id,
      wallet_address,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
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
  const seasonRow = await resolveActiveAcademyProgram(db);

  const items = (rows as unknown as LeaderboardRow[]).map((row) => toLeaderboardEntry(row, currentUserId));
  if (currentUserId) {
    const currentUserRow = await resolveAcademyLeaderboardRow(programSlug, currentUserId);
    if (currentUserRow) {
      const currentUserEntry = toLeaderboardEntry(currentUserRow, currentUserId);
      const withoutCurrentUser = items.filter((item) => item.userId !== currentUserId);
      withoutCurrentUser.unshift(currentUserEntry);
      items.splice(0, items.length, ...withoutCurrentUser.slice(0, normalizedLimit));
    }
  }

  return {
    season: seasonRow ? toSeason(seasonRow) : null,
    page: normalizedPage,
    limit: normalizedLimit,
    ...paginate(totalItems, normalizedLimit),
    items,
  };
}

async function resolveAcademyActivityPage(
  programId: string,
  userRow: ProgramUser,
  page: number,
  limit: number,
  currentUserId: string | null,
): Promise<AcademyActivityPage> {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit, DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE);
  const offset = (normalizedPage - 1) * normalizedLimit;

  const [balance, leaderboardRow, activityRows, countRows, programRow] = await Promise.all([
    resolveAcademyBalance(programId, userRow.id),
    resolveAcademyLeaderboardRowByProgramId(programId, userRow.id),
    db.execute(sql`
      select
        id,
        activity_definition_id,
        activity_code,
        activity_name,
        source_kind,
        source_reference,
        source_details,
        points_delta,
        occurred_at,
        recorded_at
      from public.points_activity_feed
      where program_id = ${programId}
        and user_id = ${userRow.id}
      order by occurred_at desc, recorded_at desc, id desc
      limit ${normalizedLimit} offset ${offset}
    `),
    db.execute(sql`
      select count(*)::bigint as total_items
      from public.points_activity_feed
      where program_id = ${programId}
        and user_id = ${userRow.id}
    `),
    resolveAcademyProgramById(programId),
  ]);

  const totalItems = asNumber((countRows[0] as { total_items?: unknown } | undefined)?.total_items, 0);
  const season = programRow ? toSeason(programRow) : null;
  const items = (activityRows as unknown as ActivityRow[]).map((row) => toActivityEntry(row));

  return {
    season,
    user: toActivityUser(
      userRow,
      balance,
      leaderboardRow ? asNumber(leaderboardRow.leaderboard_rank) : null,
      currentUserId,
    ),
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / normalizedLimit),
    items,
  };
}

async function resolveAcademyLeaderboardRowByProgramId(
  programId: string,
  userId: string,
): Promise<LeaderboardRow | null> {
  const rows = await db.execute(sql`
    select
      user_id,
      wallet_address,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
      leaderboard_rank
    from public.points_program_leaderboard
    where program_id = ${programId}
      and user_id = ${userId}
    limit 1
  `);

  return (rows[0] as LeaderboardRow | undefined) ?? null;
}

async function buildAcademySummary(input: {
  program: PointsProgram | null;
  userId: string | null;
  authenticated: boolean;
}): Promise<AcademySummary> {
  const program = input.program;

  if (!program) {
    return {
      authenticated: input.authenticated,
      season: null,
      totalPoints: 0,
      rank: null,
    };
  }

  const leaderboardRow = input.userId
    ? await resolveAcademyLeaderboardRow(program.slug, input.userId)
    : null;

  const balance = input.userId ? await resolveAcademyBalance(program.id, input.userId) : null;

  return {
    authenticated: input.authenticated,
    season: toSeason(program),
    totalPoints: balance ? asNumber(balance.currentPoints) : 0,
    rank: leaderboardRow ? asNumber(leaderboardRow.leaderboard_rank) : null,
  };
}

export type AcademyService = {
  getSummary(userId: string | null): Promise<AcademySummary>;
  getLeaderboard(page: number, limit: number, userId: string | null): Promise<AcademyLeaderboardPage>;
  getActivity(
    input: {
      walletAddress: string;
      seasonId?: string | null;
      page: number;
      limit: number;
    },
    currentUserId: string | null,
  ): Promise<AcademyActivityPage>;
  checkIn(userId: string): Promise<AcademyCheckInState>;
};

export function createAcademyService(): AcademyService {
  return {
    async getSummary(userId) {
      const program = await resolveActiveAcademyProgram(db);
      return buildAcademySummary({
        program,
        userId,
        authenticated: Boolean(userId),
      });
    },
    async getLeaderboard(page, limit, userId) {
      const program = await resolveActiveAcademyProgram(db);
      if (!program) {
        return {
          season: null,
          page: normalizePage(page),
          limit: normalizeLimit(limit, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE),
          totalPages: 0,
          items: [],
        };
      }

      return resolveAcademyLeaderboardPage(program.slug, page, limit, userId);
    },
    async getActivity(input, currentUserId) {
      const userRow = await resolveAcademyUserByWalletAddress(input.walletAddress);
      if (!userRow) {
        throw new AcademyActivityUserNotFoundError(`Academy user "${input.walletAddress}" was not found.`);
      }

      const program = input.seasonId
        ? await resolveAcademyProgramById(input.seasonId)
        : await resolveActiveAcademyProgram(db);

      if (!program) {
        return {
          season: null,
          user: toActivityUser(userRow, null, null, currentUserId),
          page: normalizePage(input.page),
          limit: normalizeLimit(input.limit, DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE),
          totalPages: 0,
          items: [],
        };
      }

      return resolveAcademyActivityPage(program.id, userRow, input.page, input.limit, currentUserId);
    },
    async checkIn(userId) {
      return runAcademyTask("check_in", userId);
    },
  };
}
