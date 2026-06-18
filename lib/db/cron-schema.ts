import { sql } from "drizzle-orm";
import { check, integer, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const cronHandlerStates = pgTable(
  "cron_handler_states",
  {
    handlerKey: text("handler_key").primaryKey(),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "string" }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true, mode: "string" }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "string" }),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    lastError: text("last_error"),
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("cron_handler_states_handler_key_not_empty", sql`btrim(${table.handlerKey}) <> ''`),
    index("cron_handler_states_locked_until_idx").on(table.lockedUntil),
    index("cron_handler_states_last_started_at_idx").on(table.lastStartedAt),
  ],
);

export type CronHandlerState = typeof cronHandlerStates.$inferSelect;
