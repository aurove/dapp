import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { pointsPrograms, pointsUserBalances, users, type PointsProgram } from "@/lib/db/schema";
import { normalizeWalletAddress } from "@/lib/auth/utils";

import {
  DEFAULT_ACADEMY_ACTIVITY_PAGE_SIZE,
  DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE,
} from "./constants";
import {
  getAcademyEpochNumber,
  getAcademyEpochWindow,
  type AcademyEpochWindow,
} from "./epoch";
import { resolveAcademyQualifiedReferralCounts, resolveAcademyReferralSummary } from "./referrals";
import { AcademyActivityUserNotFoundError } from "./tasks/errors";
import { resolveActiveAcademyProgram } from "./tasks/points";
import type {
  AcademyActivityEntry,
  AcademyActivityPage,
  AcademyActivityUser,
  AcademyLeaderboardMode,
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

type LeaderboardEntryRow = LeaderboardRow & {
  referrals: string | number | bigint;
};

type EpochLeaderboardRow = {
  user_id: string;
  wallet_address: string;
  current_points: string | number | bigint;
  lifetime_earned_points: string | number | bigint;
  lifetime_spent_points: string | number | bigint;
  entry_count: string | number | bigint;
  leaderboard_rank: string | number | bigint;
  last_activity_at: string | null;
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

function asDecimalString(value: unknown, fallback = "0"): string {
  if (typeof value === "bigint" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
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

function toLeaderboardEntry(row: LeaderboardEntryRow, currentUserId?: string | null): AcademyLeaderboardEntry {
  return {
    userId: row.user_id,
    rank: asNumber(row.leaderboard_rank),
    walletAddress: row.wallet_address,
    totalPoints: asDecimalString(row.current_points),
    referrals: asNumber(row.referrals),
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

function normalizeEpochNumber(epoch: number | null | undefined): number | null {
  return typeof epoch === "number" && Number.isInteger(epoch) && epoch > 0 ? epoch : null;
}

function paginate(totalItems: number, limit: number): { totalPages: number } {
  return {
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
  };
}

function parseLeaderboardMode(value: string | null | undefined): AcademyLeaderboardMode {
  return value?.trim().toLowerCase() === "global" ? "global" : "epoch";
}

function resolveLeaderboardTopLimit(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
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
    totalPoints: balance ? asDecimalString(balance.currentPoints) : "0",
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
    pointsDelta: asDecimalString(row.points_delta),
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

function toEpochWindow(epoch: number | null | undefined): AcademyEpochWindow {
  return getAcademyEpochWindow(normalizeEpochNumber(epoch) ?? getAcademyEpochNumber());
}

async function resolveAcademyLeaderboardPage(
  programSlug: string,
  page: number,
  limit: number,
  currentUserId: string | null,
  chainId: number | null,
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
  const seasonRow = await resolveActiveAcademyProgram(db);
  const referralCounts = seasonRow
    ? await resolveAcademyQualifiedReferralCounts(db, {
        programId: seasonRow.id,
        chainId,
        epochWindow: getAcademyEpochWindow(getAcademyEpochNumber()),
      })
    : new Map<string, number>();

  const totalItems = asNumber((countRows[0] as { total_items?: unknown } | undefined)?.total_items, 0);

  const items = (rows as unknown as LeaderboardRow[]).map((row) =>
    toLeaderboardEntry(
      {
        ...row,
        referrals: referralCounts.get(row.user_id) ?? 0,
      },
      currentUserId,
    ),
  );
  if (currentUserId) {
    const currentUserRow = await resolveAcademyLeaderboardRow(programSlug, currentUserId);
    if (currentUserRow) {
      const currentUserEntry = toLeaderboardEntry(
        {
          ...currentUserRow,
          referrals: referralCounts.get(currentUserRow.user_id) ?? 0,
        },
        currentUserId,
      );
      const withoutCurrentUser = items.filter((item) => item.userId !== currentUserId);
      withoutCurrentUser.unshift(currentUserEntry);
      items.splice(0, items.length, ...withoutCurrentUser.slice(0, normalizedLimit));
    }
  }

  return {
    season: seasonRow ? toSeason(seasonRow) : null,
    mode: "global",
    page: normalizedPage,
    limit: normalizedLimit,
    ...paginate(totalItems, normalizedLimit),
    items,
    epoch: null,
  };
}

async function resolveAcademyEpochLeaderboardPage(
  programId: string,
  epoch: number | null | undefined,
  currentUserId: string | null,
  chainId: number | null,
): Promise<AcademyLeaderboardPage> {
  const normalizedEpoch = normalizeEpochNumber(epoch) ?? getAcademyEpochNumber();
  const epochWindow = toEpochWindow(normalizedEpoch);
  const topLimit = resolveLeaderboardTopLimit(process.env.ACADEMY_LEADERBOARD_TOP_LIMIT);
  const referralCounts = await resolveAcademyQualifiedReferralCounts(db, {
    programId,
    chainId,
    epochWindow,
  });

  const leaderboardRows = await db.execute(sql`
    with epoch_leaderboard as (
      select
        l.user_id,
        u.wallet_address,
        sum(l.points_delta) as current_points,
        sum(greatest(l.points_delta, 0)) as lifetime_earned_points,
        sum(greatest(-l.points_delta, 0)) as lifetime_spent_points,
        count(*)::bigint as entry_count,
        max(l.occurred_at) as last_activity_at
      from public.points_ledger_entries l
      join public.users u on u.id = l.user_id
      where l.program_id = ${programId}
        and l.occurred_at >= ${epochWindow.startsAt}
        and l.occurred_at <= ${epochWindow.endsAt}
      group by l.user_id, u.wallet_address
    ),
    ranked_epoch_leaderboard as (
      select
        user_id,
        wallet_address,
        current_points,
        lifetime_earned_points,
        lifetime_spent_points,
        entry_count,
        last_activity_at,
        row_number() over (
          order by current_points desc, last_activity_at asc nulls last, user_id asc
        ) as leaderboard_rank
      from epoch_leaderboard
    )
    select
      user_id,
      wallet_address,
      current_points,
      lifetime_earned_points,
      lifetime_spent_points,
      entry_count,
      leaderboard_rank,
      last_activity_at
    from ranked_epoch_leaderboard
    order by leaderboard_rank asc
    limit ${topLimit}
  `);

  const countRows = await db.execute(sql`
    with epoch_leaderboard as (
      select l.user_id
      from public.points_ledger_entries l
      where l.program_id = ${programId}
        and l.occurred_at >= ${epochWindow.startsAt}
        and l.occurred_at <= ${epochWindow.endsAt}
      group by l.user_id
    )
    select count(*)::bigint as total_items
    from epoch_leaderboard
  `);

  const totalItems = asNumber((countRows[0] as { total_items?: unknown } | undefined)?.total_items, 0);
  const seasonRow = await resolveAcademyProgramById(programId);
  const items = (leaderboardRows as unknown as EpochLeaderboardRow[]).map((row) =>
    toLeaderboardEntry(
      {
        user_id: row.user_id,
        wallet_address: row.wallet_address,
        current_points: row.current_points,
        lifetime_earned_points: row.lifetime_earned_points,
        lifetime_spent_points: row.lifetime_spent_points,
        entry_count: row.entry_count,
        leaderboard_rank: row.leaderboard_rank,
        referrals: referralCounts.get(row.user_id) ?? 0,
      },
      currentUserId,
    ),
  );

  return {
    season: seasonRow ? toSeason(seasonRow) : null,
    mode: "epoch",
    page: 1,
    limit: topLimit,
    totalPages: totalItems === 0 ? 0 : 1,
    items,
    epoch: {
      epoch: normalizedEpoch,
      startsAt: epochWindow.startsAt,
      endsAt: epochWindow.endsAt,
      isCurrent: epochWindow.isCurrent,
    },
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
  chainId: number | null;
  origin: string;
  authenticated: boolean;
}): Promise<AcademySummary> {
  const program = input.program;

  if (!program) {
    return {
      authenticated: input.authenticated,
      season: null,
      totalPoints: "0",
      rank: null,
      referral: {
        refId: null,
        referralLink: null,
        directCount: 0,
        grandCount: 0,
      },
    };
  }

  const leaderboardRow = input.userId
    ? await resolveAcademyLeaderboardRow(program.slug, input.userId)
    : null;

  const balance = input.userId ? await resolveAcademyBalance(program.id, input.userId) : null;
  const referral = await resolveAcademyReferralSummary(db, {
    userId: input.userId,
    chainId: input.chainId,
    origin: input.origin,
  });

  return {
    authenticated: input.authenticated,
    season: toSeason(program),
    totalPoints: balance ? asDecimalString(balance.currentPoints) : "0",
    rank: leaderboardRow ? asNumber(leaderboardRow.leaderboard_rank) : null,
    referral,
  };
}

export type AcademyService = {
  getSummary(input: {
    userId: string | null;
    chainId: number | null;
    origin: string;
  }): Promise<AcademySummary>;
  getLeaderboard(input: {
    page: number;
    limit: number;
    userId: string | null;
    chainId: number | null;
    epoch?: number | null;
  }): Promise<AcademyLeaderboardPage>;
  getActivity(
    input: {
      walletAddress: string;
      seasonId?: string | null;
      page: number;
      limit: number;
    },
    currentUserId: string | null,
  ): Promise<AcademyActivityPage>;
};

export function createAcademyService(): AcademyService {
  return {
    async getSummary(input) {
      const program = await resolveActiveAcademyProgram(db);
      return buildAcademySummary({
        program,
        userId: input.userId,
        chainId: input.chainId,
        origin: input.origin,
        authenticated: Boolean(input.userId),
      });
    },
    async getLeaderboard(input) {
      const program = await resolveActiveAcademyProgram(db);
      if (!program) {
        return {
          season: null,
          mode: parseLeaderboardMode(process.env.ACADEMY_LEADERBOARD_MODE),
          page: normalizePage(input.page),
          limit: normalizeLimit(input.limit, DEFAULT_ACADEMY_LEADERBOARD_PAGE_SIZE),
          totalPages: 0,
          items: [],
          epoch: null,
        };
      }

      const mode = parseLeaderboardMode(process.env.ACADEMY_LEADERBOARD_MODE);
      if (mode === "global") {
        return resolveAcademyLeaderboardPage(program.slug, input.page, input.limit, input.userId, input.chainId);
      }

      return resolveAcademyEpochLeaderboardPage(program.id, input.epoch, input.userId, input.chainId);
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
  };
}
