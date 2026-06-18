import type { CronHandlerState } from "@/lib/db/cron-schema";

export type CronDatabase = typeof import("@/lib/db").db;

export type CronHandlerContext = {
  db: CronDatabase;
  now: Date;
  state: CronHandlerState;
  executionStartedAt: Date;
};

export type CronHandlerDefinition = {
  key: string;
  intervalSeconds: number;
  enabled: boolean;
  run(ctx: CronHandlerContext): Promise<unknown>;
};

export type CronHandlerStateChangeReason = "disabled" | "locked" | "not_due" | "acquire_race";

export type CronHandlerSkippedEntry = {
  key: string;
  reason: CronHandlerStateChangeReason;
  nextEligibleAt?: string | null;
};

export type CronHandlerSucceededEntry = {
  key: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result?: unknown;
};

export type CronHandlerFailedEntry = {
  key: string;
  startedAt: string;
  failedAt: string;
  durationMs: number;
  error: string;
};
