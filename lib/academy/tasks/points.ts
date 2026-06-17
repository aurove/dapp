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

import {
  ACADEMY_CHECK_IN_COOLDOWN_HOURS,
  ACADEMY_CHECK_IN_POINTS,
  ACADEMY_PROGRAM_SLUG,
} from "../constants";

type JsonRecord = Record<string, unknown>;

export type AcademyTaskPointsConfig = {
  cooldownHours: number;
  pointsAwarded: number;
};

export type AcademyTaskDefinition = {
  activityDefinition: PointsActivityDefinition;
  config: AcademyTaskPointsConfig;
};

function asRecord(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

function asPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "bigint") {
    return value > 0n ? Number(value) : fallback;
  }

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function parseTaskMetadata(metadata: unknown): AcademyTaskPointsConfig {
  const record = asRecord(metadata);
  return {
    cooldownHours: asPositiveInteger(record.cooldownHours, ACADEMY_CHECK_IN_COOLDOWN_HOURS),
    pointsAwarded: asPositiveInteger(record.pointsAwarded, ACADEMY_CHECK_IN_POINTS),
  };
}

export function computeAcademyTaskNextEligibleAt(
  occurredAt: string,
  cooldownHours: number,
): string {
  const nextEligibleAt = new Date(Date.parse(occurredAt) + cooldownHours * 60 * 60 * 1000);
  return nextEligibleAt.toISOString();
}

export function computeSecondsRemaining(nextEligibleAt: string, now = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(nextEligibleAt) - now.getTime()) / 1000));
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
    config: parseTaskMetadata(activityDefinition.metadata),
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
    programId: string;
    activityDefinitionId: string;
    userId: string;
    idempotencyKey: string;
    occurredAt: string;
    pointsDelta: number;
    sourceReference: string;
    sourceDetails: JsonRecord;
  },
): Promise<PointsLedgerEntry> {
  const rows = await client
    .insert(pointsLedgerEntries)
    .values({
      programId: input.programId,
      activityDefinitionId: input.activityDefinitionId,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      sourceKind: "system",
      sourceReference: input.sourceReference,
      sourceDetails: input.sourceDetails,
      pointsDelta: BigInt(input.pointsDelta),
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: pointsLedgerEntries.idempotencyKey })
    .returning();

  if (rows[0]) {
    return rows[0];
  }

  const existing = await client
    .select()
    .from(pointsLedgerEntries)
    .where(eq(pointsLedgerEntries.idempotencyKey, input.idempotencyKey))
    .limit(1);

  const entry = existing[0];
  if (!entry) {
    throw new Error("Failed to record Academy task points.");
  }

  return entry;
}
