import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { createNoStoreErrorResponse, createNoStoreJsonResponse, withNoStoreRouteErrorHandling } from "@/lib/server/http";
import { verifyCronRequest } from "@/lib/cron/auth";
import { stringifyJsonSafe } from "@/lib/events/json-safe";
import { cronHandlers } from "@/lib/cron/handlers";
import {
  completeCronHandlerExecution,
  failCronHandlerExecution,
  tryAcquireCronHandlerExecution,
} from "@/lib/cron/state";
import type {
  CronHandlerFailedEntry,
  CronHandlerSkippedEntry,
  CronHandlerSucceededEntry,
} from "@/lib/cron/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logCronEvent(event: string, details: Record<string, unknown>) {
  console.info(stringifyJsonSafe({ scope: "cron", event, ...details }));
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return stringifyJsonSafe(error);
  } catch {
    return "Unknown cron handler error.";
  }
}

async function postInternalCron(request: NextRequest) {
  const rawBody = await request.text();
  const authResult = verifyCronRequest(request, rawBody);
  if (!authResult.ok) {
    return createNoStoreErrorResponse(authResult.message, authResult.status, authResult.code);
  }

  const startedAt = new Date();
  const skipped: CronHandlerSkippedEntry[] = [];
  const succeeded: CronHandlerSucceededEntry[] = [];
  const failed: CronHandlerFailedEntry[] = [];

  for (const handler of cronHandlers) {
    if (!handler.enabled) {
      skipped.push({ key: handler.key, reason: "disabled" });
      logCronEvent("skipped", { key: handler.key, reason: "disabled" });
      continue;
    }

    const acquired = await tryAcquireCronHandlerExecution({ handler, now: startedAt });
    if (!acquired.acquired) {
      const reason = acquired.reason ?? "acquire_race";
      skipped.push({
        key: handler.key,
        reason,
        nextEligibleAt: acquired.nextEligibleAt ?? null,
      });
      logCronEvent("skipped", {
        key: handler.key,
        reason,
        nextEligibleAt: acquired.nextEligibleAt ?? null,
      });
      continue;
    }

    logCronEvent("started", {
      key: handler.key,
      intervalSeconds: handler.intervalSeconds,
      runCount: acquired.state.runCount.toString(),
      leaseUntil: acquired.leaseUntil,
    });

    const executionStartedAt = new Date();

    try {
      const result = await handler.run({
        db,
        now: startedAt,
        state: acquired.state,
        executionStartedAt,
      });

      const completedAt = new Date();
      await completeCronHandlerExecution({ handlerKey: handler.key, now: completedAt });
      succeeded.push({
        key: handler.key,
        startedAt: executionStartedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - executionStartedAt.getTime(),
        result,
      });
      logCronEvent("succeeded", {
        key: handler.key,
        durationMs: completedAt.getTime() - executionStartedAt.getTime(),
      });
    } catch (error) {
      const failedAt = new Date();
      const message = formatError(error);
      await failCronHandlerExecution({ handlerKey: handler.key, now: failedAt, error: message });
      failed.push({
        key: handler.key,
        startedAt: executionStartedAt.toISOString(),
        failedAt: failedAt.toISOString(),
        durationMs: failedAt.getTime() - executionStartedAt.getTime(),
        error: message,
      });
      logCronEvent("failed", {
        key: handler.key,
        durationMs: failedAt.getTime() - executionStartedAt.getTime(),
        error: message,
      });
    }
  }

  return createNoStoreJsonResponse({
    ok: true,
    checkedAt: startedAt.toISOString(),
    registeredHandlers: cronHandlers.length,
    summary: {
      ran: succeeded.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    succeeded,
    skipped,
    failed,
  });
}

export const POST = withNoStoreRouteErrorHandling("internal/cron", postInternalCron, {
  message: "Unable to process cron handlers.",
  status: 500,
  code: "CRON_FAILED",
});
