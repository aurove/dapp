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

type AcademyCheckInProgram = NonNullable<Awaited<ReturnType<typeof resolveActiveAcademyProgram>>>;
type AcademyCheckInTask = NonNullable<Awaited<ReturnType<typeof resolveAcademyTaskDefinition>>>;
type AcademyCheckInLedgerEntry = Awaited<ReturnType<typeof resolveAcademyTaskLedgerEntry>>;

type AcademyCheckInContext = {
  program: AcademyCheckInProgram;
  task: AcademyCheckInTask;
  latestEntry: AcademyCheckInLedgerEntry;
};

function buildCheckInIdempotencyKey(input: {
  programSlug: string;
  userId: string;
  chainId: number;
  taskCode: string;
  lastCheckInAt: string | null;
}): string {
  return [
    "academy",
    input.programSlug,
    input.chainId,
    input.taskCode,
    input.userId,
    input.lastCheckInAt ?? "initial",
  ].join(":");
}

async function resolveAcademyCheckInContext(input: {
  userId: string;
  chainId: number;
}): Promise<AcademyCheckInContext> {
  const program = await resolveActiveAcademyProgram(db);
  if (!program) {
    throw new AcademyTaskNotFoundError("Academy season is not configured.");
  }

  const task = await resolveAcademyTaskDefinition(db, program.id, ACADEMY_CHECK_IN_TASK_CODE);
  if (!task) {
    throw new AcademyTaskNotFoundError("Academy check-in task is not configured.");
  }

  const latestEntry = await resolveAcademyTaskLedgerEntry(db, {
    programId: program.id,
    activityDefinitionId: task.activityDefinition.id,
    userId: input.userId,
  });

  return {
    program,
    task,
    latestEntry,
  };
}

function buildAcademyCheckInState(input: {
  task: AcademyCheckInTask;
  latestEntry: AcademyCheckInLedgerEntry;
}): AcademyCheckInState {
  if (input.latestEntry) {
    const nextEligibleAt = computeAcademyTaskNextEligibleAt(
      input.latestEntry.occurredAt,
      input.task.config.cooldownHours,
    );
    if (Date.parse(nextEligibleAt) > Date.now()) {
      return {
        taskCode: ACADEMY_CHECK_IN_TASK_CODE,
        status: "cooldown",
        cooldownHours: input.task.config.cooldownHours,
        pointsAwarded: input.task.config.pointsAwarded,
        lastCheckInAt: input.latestEntry.occurredAt,
        nextEligibleAt,
        secondsRemaining: computeSecondsRemaining(nextEligibleAt),
      };
    }
  }

  return {
    taskCode: ACADEMY_CHECK_IN_TASK_CODE,
    status: "success",
    cooldownHours: input.task.config.cooldownHours,
    pointsAwarded: input.task.config.pointsAwarded,
    lastCheckInAt: input.latestEntry?.occurredAt ?? null,
    nextEligibleAt: input.latestEntry
      ? computeAcademyTaskNextEligibleAt(input.latestEntry.occurredAt, input.task.config.cooldownHours)
      : null,
    secondsRemaining: 0,
  };
}

export async function getAcademyCheckInState(input: {
  userId: string;
  chainId: number;
}): Promise<AcademyCheckInState> {
  return db.transaction(async () => {
    const context = await resolveAcademyCheckInContext(input);
    return buildAcademyCheckInState(context);
  });
}

export async function runAcademyCheckIn(input: {
  userId: string;
  chainId: number;
}): Promise<AcademyCheckInState> {
  return db.transaction(async (tx) => {
    const client = tx as typeof db;
    const context = await resolveAcademyCheckInContext(input);
    const { program, task, latestEntry } = context;
    const currentState = buildAcademyCheckInState(context);

    if (currentState.status === "cooldown") {
      return currentState;
    }

    const occurredAt = new Date().toISOString();
    const idempotencyKey = buildCheckInIdempotencyKey({
      programSlug: program.slug,
      userId: input.userId,
      chainId: input.chainId,
      taskCode: task.activityDefinition.code,
      lastCheckInAt: latestEntry?.occurredAt ?? null,
    });

    const entry = await recordAcademyTaskPoints(client, {
      programId: program.id,
      activityDefinitionId: task.activityDefinition.id,
      userId: input.userId,
      chainId: input.chainId,
      idempotencyKey,
      occurredAt,
      pointsDelta: task.config.pointsAwarded,
      sourceReference: `${program.slug}:${task.activityDefinition.code}`,
      sourceDetails: {
        taskCode: task.activityDefinition.code,
        cooldownHours: task.config.cooldownHours,
        pointsAwarded: task.config.pointsAwarded,
        lastCheckInAt: latestEntry?.occurredAt ?? null,
        chainId: input.chainId,
      },
    });

    return {
      taskCode: ACADEMY_CHECK_IN_TASK_CODE,
      status: "success",
      cooldownHours: task.config.cooldownHours,
      pointsAwarded: task.config.pointsAwarded,
      lastCheckInAt: entry.occurredAt,
      nextEligibleAt: computeAcademyTaskNextEligibleAt(entry.occurredAt, task.config.cooldownHours),
      secondsRemaining: computeSecondsRemaining(
        computeAcademyTaskNextEligibleAt(entry.occurredAt, task.config.cooldownHours),
      ),
    };
  });
}
