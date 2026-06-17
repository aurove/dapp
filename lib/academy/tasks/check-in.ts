import "server-only";

import { db } from "@/lib/db";

import { ACADEMY_CHECK_IN_TASK_CODE } from "../constants";
import type { AcademyCheckInState } from "../types";
import {
  computeAcademyTaskNextEligibleAt,
  computeSecondsRemaining,
  recordAcademyTaskPoints,
  resolveActiveAcademyProgram,
  resolveAcademyTaskDefinition,
  resolveAcademyTaskLedgerEntry,
} from "./points";
import { AcademyTaskNotFoundError } from "./errors";

function buildCheckInIdempotencyKey(input: {
  programSlug: string;
  userId: string;
  taskCode: string;
  lastCheckInAt: string | null;
}): string {
  return [
    "academy",
    input.programSlug,
    input.taskCode,
    input.userId,
    input.lastCheckInAt ?? "initial",
  ].join(":");
}

export async function runAcademyCheckIn(userId: string): Promise<AcademyCheckInState> {
  return db.transaction(async (tx) => {
    const client = tx as typeof db;
    const program = await resolveActiveAcademyProgram(client);
    if (!program) {
      throw new AcademyTaskNotFoundError("Academy season is not configured.");
    }

    const task = await resolveAcademyTaskDefinition(client, program.id, ACADEMY_CHECK_IN_TASK_CODE);
    if (!task) {
      throw new AcademyTaskNotFoundError("Academy check-in task is not configured.");
    }

    const latestEntry = await resolveAcademyTaskLedgerEntry(client, {
      programId: program.id,
      activityDefinitionId: task.activityDefinition.id,
      userId,
    });

    if (latestEntry) {
      const nextEligibleAt = computeAcademyTaskNextEligibleAt(
        latestEntry.occurredAt,
        task.config.cooldownHours,
      );
      if (Date.parse(nextEligibleAt) > Date.now()) {
        return {
          taskCode: ACADEMY_CHECK_IN_TASK_CODE,
          status: "cooldown",
          cooldownHours: task.config.cooldownHours,
          pointsAwarded: task.config.pointsAwarded,
          lastCheckInAt: latestEntry.occurredAt,
          nextEligibleAt,
          secondsRemaining: computeSecondsRemaining(nextEligibleAt),
        };
      }
    }

    const occurredAt = new Date().toISOString();
    const idempotencyKey = buildCheckInIdempotencyKey({
      programSlug: program.slug,
      userId,
      taskCode: task.activityDefinition.code,
      lastCheckInAt: latestEntry?.occurredAt ?? null,
    });

    const entry = await recordAcademyTaskPoints(client, {
      programId: program.id,
      activityDefinitionId: task.activityDefinition.id,
      userId,
      idempotencyKey,
      occurredAt,
      pointsDelta: task.config.pointsAwarded,
      sourceReference: `${program.slug}:${task.activityDefinition.code}`,
      sourceDetails: {
        taskCode: task.activityDefinition.code,
        cooldownHours: task.config.cooldownHours,
        pointsAwarded: task.config.pointsAwarded,
        lastCheckInAt: latestEntry?.occurredAt ?? null,
      },
    });

    const nextEligibleAt = computeAcademyTaskNextEligibleAt(
      entry.occurredAt,
      task.config.cooldownHours,
    );

    return {
      taskCode: ACADEMY_CHECK_IN_TASK_CODE,
      status: "success",
      cooldownHours: task.config.cooldownHours,
      pointsAwarded: task.config.pointsAwarded,
      lastCheckInAt: entry.occurredAt,
      nextEligibleAt,
      secondsRemaining: computeSecondsRemaining(nextEligibleAt),
    };
  });
}
