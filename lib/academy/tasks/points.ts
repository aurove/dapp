import "server-only";

import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  pointsActivityDefinitions,
  pointsLedgerEntries,
  pointsPrograms,
  type PointsActivityDefinition,
  type PointsLedgerEntry,
  type PointsProgram,
} from "@/lib/db/schema";

import { ACADEMY_PROGRAM_SLUG } from "../constants";
import { chainTimestampToIso } from "../time";
import { AcademySeasonOutOfWindowError } from "./errors";
import {
  resolveAcademyReferralRecipients,
  formatAcademyReferralPoints,
  splitAcademyReferralPointUnits,
} from "../referrals";

type JsonRecord = Record<string, unknown>;

export type AcademyTaskDefinition = {
  activityDefinition: PointsActivityDefinition;
};

type AcademySeasonWindow = Pick<PointsProgram, "startsAt" | "endsAt">;


function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isAcademyProgramActiveAt(
  program: AcademySeasonWindow,
  chainTimestampSeconds: number,
): boolean {
  const chainTimestampMs = chainTimestampSeconds * 1000;
  const startsAtMs = parseTimestamp(program.startsAt);
  if (startsAtMs !== null && chainTimestampMs < startsAtMs) {
    return false;
  }

  const endsAtMs = parseTimestamp(program.endsAt);
  if (endsAtMs !== null && chainTimestampMs > endsAtMs) {
    return false;
  }

  return true;
}

function assertAcademyProgramActiveAt(
  program: AcademySeasonWindow,
  chainTimestampSeconds: number,
): void {
  if (!isAcademyProgramActiveAt(program, chainTimestampSeconds)) {
    throw new AcademySeasonOutOfWindowError("Academy season is not currently active.");
  }
}

type AcademyTaskAwardInput = {
  program: PointsProgram;
  activityDefinitionId: string;
  userId: string;
  chainId: number;
  idempotencyKey: string;
  chainTimestampSeconds: number;
  pointsDelta: number | string | bigint;
  sourceReference: string;
  sourceDetails: JsonRecord;
  sourceKind?: PointsLedgerEntry["sourceKind"];
};

type AcademyTaskAwardRecipient = {
  userId: string;
  rewardType: "task_award_user" | "task_award_referral_direct" | "task_award_referral_grand";
  referralLevel: "user" | "direct" | "grand";
  percentage: number;
  pointsDelta: string;
  idempotencyKey: string;
  sourceReference: string;
};

function formatSourceReference(baseReference: string, rewardType: AcademyTaskAwardRecipient["rewardType"]): string {
  return `${baseReference}:${rewardType}`;
}

function toJsonSafePointsValue(value: number | string | bigint): number | string {
  return typeof value === "bigint" ? value.toString() : value;
}

function buildAcademyTaskAwardRecipients(
  input: AcademyTaskAwardInput,
  referralChain: {
    directReferrerUserId: string | null;
    grandReferrerUserId: string | null;
  },
): AcademyTaskAwardRecipient[] {
  const split = splitAcademyReferralPointUnits(input.pointsDelta);

  const recipients: AcademyTaskAwardRecipient[] = [
    {
      userId: input.userId,
      rewardType: "task_award_user",
      referralLevel: "user",
      percentage: 90,
      pointsDelta: formatAcademyReferralPoints(split.userUnits),
      idempotencyKey: `${input.idempotencyKey}:user`,
      sourceReference: formatSourceReference(input.sourceReference, "task_award_user"),
    },
  ];

  if (
    referralChain.directReferrerUserId &&
    split.directUnits > 0n
  ) {
    recipients.push({
      userId: referralChain.directReferrerUserId,
      rewardType: "task_award_referral_direct",
      referralLevel: "direct",
      percentage: 3,
      pointsDelta: formatAcademyReferralPoints(split.directUnits),
      idempotencyKey: `${input.idempotencyKey}:ref:direct`,
      sourceReference: formatSourceReference(input.sourceReference, "task_award_referral_direct"),
    });
  }

  if (
    referralChain.grandReferrerUserId &&
    split.grandUnits > 0n
  ) {
    recipients.push({
      userId: referralChain.grandReferrerUserId,
      rewardType: "task_award_referral_grand",
      referralLevel: "grand",
      percentage: 7,
      pointsDelta: formatAcademyReferralPoints(split.grandUnits),
      idempotencyKey: `${input.idempotencyKey}:ref:grand`,
      sourceReference: formatSourceReference(input.sourceReference, "task_award_referral_grand"),
    });
  }

  return recipients;
}

async function insertAcademyTaskAward(
  client: typeof db,
  input: AcademyTaskAwardInput & { occurredAt: string; recordedAt: string },
  recipient: AcademyTaskAwardRecipient,
): Promise<PointsLedgerEntry | null> {
  const rows = await client
    .insert(pointsLedgerEntries)
    .values({
      programId: input.program.id,
      activityDefinitionId: input.activityDefinitionId,
      userId: recipient.userId,
      idempotencyKey: recipient.idempotencyKey,
      sourceKind: input.sourceKind ?? "system",
      sourceReference: recipient.sourceReference,
      sourceDetails: {
        ...input.sourceDetails,
        awardType: recipient.rewardType,
        referralLevel: recipient.referralLevel,
        percentage: recipient.percentage,
        sourceReference: input.sourceReference,
        recipientUserId: recipient.userId,
        originalUserId: input.userId,
        basePoints: toJsonSafePointsValue(input.pointsDelta),
        pointsAwarded: recipient.pointsDelta,
      },
      pointsDelta: recipient.pointsDelta,
      occurredAt: input.occurredAt,
      recordedAt: input.recordedAt,
    })
    .onConflictDoNothing({ target: pointsLedgerEntries.idempotencyKey })
    .returning();

  if (rows[0]) {
    return rows[0];
  }

  const existing = await client
    .select()
    .from(pointsLedgerEntries)
    .where(eq(pointsLedgerEntries.idempotencyKey, recipient.idempotencyKey))
    .limit(1);

  return existing[0] ?? null;
}

export async function resolveActiveAcademyProgram(client: typeof db): Promise<PointsProgram | null> {
  const rows = await client
    .select()
    .from(pointsPrograms)
    .where(eq(pointsPrograms.slug, ACADEMY_PROGRAM_SLUG))
    .limit(1);

  const preferred = rows[0];
  if (
    preferred?.status === "active" &&
    (preferred.kind === "season" || preferred.kind === "campaign")
  ) {
    return preferred;
  }

  const activePrograms = await client
    .select()
    .from(pointsPrograms)
    .where(
      and(
        eq(pointsPrograms.status, "active"),
        or(eq(pointsPrograms.kind, "season"), eq(pointsPrograms.kind, "campaign")),
      ),
    )
    .orderBy(desc(pointsPrograms.startsAt), desc(pointsPrograms.createdAt))
    .limit(1);

  return activePrograms[0] ?? null;
}

export async function resolveAcademyTaskDefinition(
  client: typeof db,
  programId: string,
  taskCode: string,
): Promise<AcademyTaskDefinition | null> {
  const rows = await client
    .select()
    .from(pointsActivityDefinitions)
    .where(
      and(
        eq(pointsActivityDefinitions.programId, programId),
        eq(pointsActivityDefinitions.code, taskCode),
        eq(pointsActivityDefinitions.isActive, true),
      ),
    )
    .limit(1);

  const activityDefinition = rows[0];
  if (!activityDefinition) {
    return null;
  }

  return {
    activityDefinition,
  };
}

export async function resolveAcademyTaskLedgerEntry(
  client: typeof db,
  input: {
    programId: string;
    activityDefinitionId: string;
    userId: string;
  },
): Promise<PointsLedgerEntry | null> {
  const rows = await client
    .select()
    .from(pointsLedgerEntries)
    .where(
      and(
        eq(pointsLedgerEntries.programId, input.programId),
        eq(pointsLedgerEntries.activityDefinitionId, input.activityDefinitionId),
        eq(pointsLedgerEntries.userId, input.userId),
      ),
    )
    .orderBy(desc(pointsLedgerEntries.occurredAt), desc(pointsLedgerEntries.recordedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function recordAcademyTaskPoints(
  client: typeof db,
  input: {
    program: PointsProgram;
    activityDefinitionId: string;
    userId: string;
    chainId: number;
    idempotencyKey: string;
    chainTimestampSeconds: number;
    pointsDelta: number | string | bigint;
    sourceReference: string;
    sourceDetails: JsonRecord;
    sourceKind?: PointsLedgerEntry["sourceKind"];
  },
): Promise<PointsLedgerEntry> {
  assertAcademyProgramActiveAt(input.program, input.chainTimestampSeconds);
  const occurredAt = chainTimestampToIso(input.chainTimestampSeconds);
  const referralChain = await resolveAcademyReferralRecipients(client, {
    userId: input.userId,
    chainId: input.chainId,
  });

  const recipients = buildAcademyTaskAwardRecipients(input, referralChain);
  const recordedEntries: Array<PointsLedgerEntry | null> = [];

  for (const recipient of recipients) {
    const entry = await insertAcademyTaskAward(
      client,
      {
        ...input,
        occurredAt,
        recordedAt: occurredAt,
      },
      recipient,
    );
    if (entry) {
      recordedEntries.push(entry);
    }
  }

  const userEntry = recordedEntries.find((entry) => entry?.userId === input.userId) ?? null;
  if (userEntry) {
    return userEntry;
  }

  const existing = await client
    .select()
    .from(pointsLedgerEntries)
    .where(eq(pointsLedgerEntries.idempotencyKey, `${input.idempotencyKey}:user`))
    .limit(1);

  const entry = existing[0];
  if (!entry) {
    throw new Error("Failed to record Academy task points.");
  }

  return entry;
}
