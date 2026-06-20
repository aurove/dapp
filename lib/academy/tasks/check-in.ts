import "server-only";

import { db } from "@/lib/db";
import { computeChainSecondsRemaining } from "@/lib/academy/time";

import { ACADEMY_CHECK_IN_TASK_CODE } from "../constants";
import type { AcademyCheckInState } from "../types";
import {
  computeAcademyTaskNextEligibleAt,
  getAcademySeasonState,
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

async function resolveAcademyCheckInContext(
  client: typeof db,
  input: {
    userId: string;
    chainId: number;
  },
): Promise<AcademyCheckInContext> {
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
    userId: input.userId,
  });

  return {
    program,
    task,
    latestEntry,
  };
}

function buildAcademyCheckInState(input: {
  program: AcademyCheckInProgram;
  task: AcademyCheckInTask;
  latestEntry: AcademyCheckInLedgerEntry;
  chainTimestampSeconds: number;
}): AcademyCheckInState {
  const seasonState = getAcademySeasonState(input.program, input.chainTimestampSeconds);
  const baseState = {
    taskCode: "check_in" as const,
    cooldownHours: input.task.config.cooldownHours,
    pointsAwarded: input.task.config.pointsAwarded,
    lastCheckInAt: input.latestEntry?.occurredAt ?? null,
    seasonStartsAt: input.program.startsAt,
    seasonEndsAt: input.program.endsAt,
  };

  if (seasonState.status === "inactive") {
    return {
      ...baseState,
      status: "inactive",
      inactiveReason: seasonState.inactiveReason ?? undefined,
      nextEligibleAt: seasonState.nextEligibleAt,
      secondsRemaining: seasonState.secondsRemaining,
    };
  }

  if (input.latestEntry) {
    const nextEligibleAt = computeAcademyTaskNextEligibleAt(
      input.latestEntry.occurredAt,
      input.task.config.cooldownHours,
    );
    const secondsRemaining = computeChainSecondsRemaining(
      nextEligibleAt,
      input.chainTimestampSeconds,
    );
    if (secondsRemaining > 0) {
      return {
        ...baseState,
        status: "cooldown",
        nextEligibleAt,
        secondsRemaining,
      };
    }
  }

  return {
    ...baseState,
    status: "success",
    nextEligibleAt: input.latestEntry
      ? computeAcademyTaskNextEligibleAt(
          input.latestEntry.occurredAt,
          input.task.config.cooldownHours,
        )
      : null,
    secondsRemaining: 0,
  };
}

export async function getAcademyCheckInState(input: {
  userId: string;
  chainId: number;
  chainTimestampSeconds: number;
}): Promise<AcademyCheckInState> {
  const context = await resolveAcademyCheckInContext(db, input);
  return buildAcademyCheckInState({ ...context, chainTimestampSeconds: input.chainTimestampSeconds });
}

export async function runAcademyCheckIn(input: {
  userId: string;
  chainId: number;
  chainTimestampSeconds: number;
}): Promise<AcademyCheckInState> {
  return db.transaction(async (client) => {
    const context = await resolveAcademyCheckInContext(client, input);
    const { program, task, latestEntry } = context;
    const currentState = buildAcademyCheckInState({
      ...context,
      chainTimestampSeconds: input.chainTimestampSeconds,
    });

    if (currentState.status === "inactive") {
      return currentState;
    }

    if (currentState.status === "cooldown") {
      return currentState;
    }

    const idempotencyKey = buildCheckInIdempotencyKey({
      programSlug: program.slug,
      userId: input.userId,
      chainId: input.chainId,
      taskCode: task.activityDefinition.code,
      lastCheckInAt: latestEntry?.occurredAt ?? null,
    });

    const entry = await recordAcademyTaskPoints(client, {
      program,
      activityDefinitionId: task.activityDefinition.id,
      userId: input.userId,
      chainId: input.chainId,
      idempotencyKey,
      chainTimestampSeconds: input.chainTimestampSeconds,
      pointsDelta: task.config.pointsAwarded,
      sourceReference: `${program.slug}:${task.activityDefinition.code}`,
      sourceDetails: {
        taskCode: task.activityDefinition.code,
        cooldownHours: task.config.cooldownHours,
        pointsAwarded: task.config.pointsAwarded,
        lastCheckInAt: latestEntry?.occurredAt ?? null,
        chainId: input.chainId,
        chainTimestamp: input.chainTimestampSeconds,
      },
    });

    return {
      taskCode: ACADEMY_CHECK_IN_TASK_CODE,
      status: "success",
      cooldownHours: task.config.cooldownHours,
      pointsAwarded: task.config.pointsAwarded,
      seasonStartsAt: program.startsAt,
      seasonEndsAt: program.endsAt,
      lastCheckInAt: entry.occurredAt,
      nextEligibleAt: computeAcademyTaskNextEligibleAt(entry.occurredAt, task.config.cooldownHours),
      secondsRemaining: computeChainSecondsRemaining(
        computeAcademyTaskNextEligibleAt(entry.occurredAt, task.config.cooldownHours),
        input.chainTimestampSeconds,
      ),
    };
  });
}
