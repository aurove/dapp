import { and, eq, sql } from "drizzle-orm";

import { cronHandlerStates, type CronHandlerState } from "@/lib/db/cron-schema";
import { db } from "@/lib/db";
import type { CronHandlerDefinition } from "./types";

const MIN_LOCK_LEASE_SECONDS = 30;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function addSeconds(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1000);
}

function getLockLeaseSeconds(intervalSeconds: number): number {
  return Math.max(intervalSeconds * 2, MIN_LOCK_LEASE_SECONDS);
}

function isDue(state: CronHandlerState, now: Date, intervalSeconds: number): boolean {
  if (!state.lastStartedAt) {
    return true;
  }

  const dueAt = addSeconds(new Date(state.lastStartedAt), intervalSeconds);
  return now >= dueAt;
}

export async function ensureCronHandlerState(handlerKey: string) {
  await db
    .insert(cronHandlerStates)
    .values({ handlerKey })
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(cronHandlerStates)
    .where(eq(cronHandlerStates.handlerKey, handlerKey))
    .limit(1);

  return rows[0] ?? null;
}

export async function tryAcquireCronHandlerExecution(input: {
  handler: CronHandlerDefinition;
  now: Date;
}) {
  const state = await ensureCronHandlerState(input.handler.key);
  if (!state) {
    throw new Error(`Unable to load cron handler state for ${input.handler.key}.`);
  }

  const lockedUntil = state.lockedUntil ? new Date(state.lockedUntil) : null;
  if (lockedUntil && lockedUntil > input.now) {
    return {
      acquired: false,
      reason: "locked" as const,
      state,
      nextEligibleAt: lockedUntil.toISOString(),
    };
  }

  if (!isDue(state, input.now, input.handler.intervalSeconds)) {
    const dueAt = state.lastStartedAt
      ? addSeconds(new Date(state.lastStartedAt), input.handler.intervalSeconds)
      : null;

    return {
      acquired: false,
      reason: "not_due" as const,
      state,
      nextEligibleAt: dueAt?.toISOString() ?? null,
    };
  }

  const leaseUntil = addSeconds(input.now, getLockLeaseSeconds(input.handler.intervalSeconds));
  const result = await db
    .update(cronHandlerStates)
    .set({
      lastStartedAt: toIsoString(input.now),
      lockedUntil: toIsoString(leaseUntil),
      runCount: sql`${cronHandlerStates.runCount} + 1`,
      updatedAt: toIsoString(input.now),
    })
    .where(
      and(
        eq(cronHandlerStates.handlerKey, input.handler.key),
        sql`(${cronHandlerStates.lockedUntil} is null or ${cronHandlerStates.lockedUntil} <= ${toIsoString(input.now)})`,
        sql`(${cronHandlerStates.lastStartedAt} is null or ${cronHandlerStates.lastStartedAt} <= ${toIsoString(addSeconds(input.now, -input.handler.intervalSeconds))})`,
      ),
    )
    .returning();

  if (result.length === 0) {
    const currentRows = await db
      .select()
      .from(cronHandlerStates)
      .where(eq(cronHandlerStates.handlerKey, input.handler.key))
      .limit(1);

    const current = currentRows[0] ?? state;
    const currentLockedUntil = current.lockedUntil ? new Date(current.lockedUntil) : null;
    if (currentLockedUntil && currentLockedUntil > input.now) {
      return {
        acquired: false,
        reason: "locked" as const,
        state: current,
        nextEligibleAt: currentLockedUntil.toISOString(),
      };
    }

    const nextEligibleAt = current.lastStartedAt
      ? addSeconds(new Date(current.lastStartedAt), input.handler.intervalSeconds).toISOString()
      : null;

    return {
      acquired: false,
      reason: "acquire_race" as const,
      state: current,
      nextEligibleAt,
    };
  }

  return {
    acquired: true,
    state: result[0] as CronHandlerState,
    leaseUntil: leaseUntil.toISOString(),
  };
}

export async function completeCronHandlerExecution(input: {
  handlerKey: string;
  now: Date;
}) {
  const rows = await db
    .update(cronHandlerStates)
    .set({
      lastCompletedAt: toIsoString(input.now),
      lastSuccessAt: toIsoString(input.now),
      lockedUntil: null,
      lastError: null,
      updatedAt: toIsoString(input.now),
    })
    .where(eq(cronHandlerStates.handlerKey, input.handlerKey))
    .returning();

  return rows[0] ?? null;
}

export async function failCronHandlerExecution(input: {
  handlerKey: string;
  now: Date;
  error: string;
}) {
  const rows = await db
    .update(cronHandlerStates)
    .set({
      lastCompletedAt: toIsoString(input.now),
      lockedUntil: null,
      lastError: input.error,
      updatedAt: toIsoString(input.now),
    })
    .where(eq(cronHandlerStates.handlerKey, input.handlerKey))
    .returning();

  return rows[0] ?? null;
}
