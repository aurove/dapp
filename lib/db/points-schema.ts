import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth-schema";

export const pointsProgramKindEnum = pgEnum("points_program_kind", ["season", "campaign", "evergreen"]);
export const pointsProgramStatusEnum = pgEnum("points_program_status", [
  "draft",
  "scheduled",
  "active",
  "paused",
  "ended",
  "archived",
]);
export const pointsSourceKindEnum = pgEnum("points_source_kind", [
  "manual",
  "contract_event",
  "system",
  "import",
  "adjustment",
]);

export const pointsPrograms = pgTable(
  "points_programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    kind: pointsProgramKindEnum("kind").notNull().default("season"),
    status: pointsProgramStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("points_programs_slug_not_empty", sql`btrim(${table.slug}) <> ''`),
    check("points_programs_slug_lowercase", sql`${table.slug} = lower(${table.slug})`),
    check("points_programs_name_not_empty", sql`btrim(${table.name}) <> ''`),
    check(
      "points_programs_date_range_valid",
      sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} >= ${table.startsAt}`,
    ),
    check("points_programs_metadata_is_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("points_programs_status_idx").on(table.status),
    index("points_programs_kind_idx").on(table.kind),
    index("points_programs_active_window_idx").on(table.startsAt, table.endsAt),
  ],
);

export const pointsActivityDefinitions = pgTable(
  "points_activity_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => pointsPrograms.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sourceKind: pointsSourceKindEnum("source_kind").notNull().default("manual"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("points_activity_definitions_code_not_empty", sql`btrim(${table.code}) <> ''`),
    check("points_activity_definitions_code_lowercase", sql`${table.code} = lower(${table.code})`),
    check("points_activity_definitions_name_not_empty", sql`btrim(${table.name}) <> ''`),
    check(
      "points_activity_definitions_metadata_is_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    uniqueIndex("points_activity_definitions_program_code_idx").on(table.programId, table.code),
    index("points_activity_definitions_program_active_idx").on(table.programId, table.isActive),
    index("points_activity_definitions_source_kind_idx").on(table.sourceKind),
  ],
);

export const pointsLedgerEntries = pgTable(
  "points_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => pointsPrograms.id, { onDelete: "cascade" }),
    activityDefinitionId: uuid("activity_definition_id")
      .notNull()
      .references(() => pointsActivityDefinitions.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    sourceKind: pointsSourceKindEnum("source_kind").notNull(),
    sourceReference: text("source_reference"),
    sourceDetails: jsonb("source_details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    pointsDelta: numeric("points_delta", { precision: 18, scale: 4, mode: "string" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("points_ledger_entries_idempotency_key_not_empty", sql`btrim(${table.idempotencyKey}) <> ''`),
    check("points_ledger_entries_points_delta_nonzero", sql`${table.pointsDelta} <> 0`),
    check(
      "points_ledger_entries_source_details_is_object",
      sql`jsonb_typeof(${table.sourceDetails}) = 'object'`,
    ),
    uniqueIndex("points_ledger_entries_idempotency_key_idx").on(table.idempotencyKey),
    index("points_ledger_entries_program_user_occurred_idx").on(table.programId, table.userId, table.occurredAt),
    index("points_ledger_entries_program_activity_occurred_idx").on(
      table.programId,
      table.activityDefinitionId,
      table.occurredAt,
    ),
    index("points_ledger_entries_program_occurred_idx").on(table.programId, table.occurredAt),
    index("points_ledger_entries_source_lookup_idx").on(table.sourceKind, table.sourceReference),
  ],
);

export const pointsUserBalances = pgTable(
  "points_user_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => pointsPrograms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currentPoints: numeric("current_points", { precision: 18, scale: 4, mode: "string" })
      .notNull()
      .default("0.0000"),
    lifetimeEarnedPoints: numeric("lifetime_earned_points", { precision: 18, scale: 4, mode: "string" })
      .notNull()
      .default("0.0000"),
    lifetimeSpentPoints: numeric("lifetime_spent_points", { precision: 18, scale: 4, mode: "string" })
      .notNull()
      .default("0.0000"),
    entryCount: bigint("entry_count", { mode: "bigint" }).notNull().default(0n),
    firstActivityAt: timestamp("first_activity_at", { withTimezone: true, mode: "string" }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("points_user_balances_program_user_idx").on(table.programId, table.userId),
    index("points_user_balances_program_points_rank_idx").on(
      table.programId,
      table.currentPoints,
      table.lastActivityAt,
      table.userId,
    ),
    index("points_user_balances_user_program_idx").on(table.userId, table.programId),
    index("points_user_balances_program_last_activity_idx").on(table.programId, table.lastActivityAt),
    check(
      "points_user_balances_totals_non_negative",
      sql`${table.lifetimeEarnedPoints} >= 0 and ${table.lifetimeSpentPoints} >= 0 and ${table.entryCount} >= 0`,
    ),
    check(
      "points_user_balances_current_points_consistent",
      sql`${table.currentPoints} = ${table.lifetimeEarnedPoints} - ${table.lifetimeSpentPoints}`,
    ),
  ],
);

export const pointsProgramsRelations = relations(pointsPrograms, ({ many }) => ({
  activityDefinitions: many(pointsActivityDefinitions),
  ledgerEntries: many(pointsLedgerEntries),
  userBalances: many(pointsUserBalances),
}));

export const pointsActivityDefinitionsRelations = relations(pointsActivityDefinitions, ({ one, many }) => ({
  program: one(pointsPrograms, {
    fields: [pointsActivityDefinitions.programId],
    references: [pointsPrograms.id],
  }),
  ledgerEntries: many(pointsLedgerEntries),
}));

export const pointsLedgerEntriesRelations = relations(pointsLedgerEntries, ({ one }) => ({
  program: one(pointsPrograms, {
    fields: [pointsLedgerEntries.programId],
    references: [pointsPrograms.id],
  }),
  activityDefinition: one(pointsActivityDefinitions, {
    fields: [pointsLedgerEntries.activityDefinitionId],
    references: [pointsActivityDefinitions.id],
  }),
  user: one(users, {
    fields: [pointsLedgerEntries.userId],
    references: [users.id],
  }),
}));

export const pointsUserBalancesRelations = relations(pointsUserBalances, ({ one }) => ({
  program: one(pointsPrograms, {
    fields: [pointsUserBalances.programId],
    references: [pointsPrograms.id],
  }),
  user: one(users, {
    fields: [pointsUserBalances.userId],
    references: [users.id],
  }),
}));

export type PointsProgram = typeof pointsPrograms.$inferSelect;
export type PointsActivityDefinition = typeof pointsActivityDefinitions.$inferSelect;
export type PointsLedgerEntry = typeof pointsLedgerEntries.$inferSelect;
export type PointsUserBalance = typeof pointsUserBalances.$inferSelect;
