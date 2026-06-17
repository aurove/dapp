import { relations, sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth-schema";

export const academyReferralCodes = pgTable(
  "academy_referral_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    refId: text("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("academy_referral_codes_ref_id_not_empty", sql`btrim(${table.refId}) <> ''`),
    check("academy_referral_codes_ref_id_length", sql`char_length(${table.refId}) = 8`),
    check(
      "academy_referral_codes_ref_id_charset",
      sql`${table.refId} ~ '^[A-Za-z0-9_-]+$'`,
    ),
    uniqueIndex("academy_referral_codes_user_chain_idx").on(table.userId, table.chainId),
    uniqueIndex("academy_referral_codes_ref_id_idx").on(table.refId),
    index("academy_referral_codes_chain_idx").on(table.chainId),
  ],
);

export const academyReferralRelationships = pgTable(
  "academy_referral_relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    refId: text("ref_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("academy_referral_relationships_not_self_referral", sql`${table.referredUserId} <> ${table.referrerUserId}`),
    check("academy_referral_relationships_ref_id_not_empty", sql`btrim(${table.refId}) <> ''`),
    check("academy_referral_relationships_ref_id_length", sql`char_length(${table.refId}) = 8`),
    uniqueIndex("academy_referral_relationships_referred_chain_idx").on(table.referredUserId, table.chainId),
    index("academy_referral_relationships_referrer_chain_idx").on(table.referrerUserId, table.chainId),
    index("academy_referral_relationships_chain_idx").on(table.chainId),
    index("academy_referral_relationships_ref_id_idx").on(table.refId),
  ],
);

export const academyReferralCodesRelations = relations(academyReferralCodes, ({ one }) => ({
  user: one(users, {
    fields: [academyReferralCodes.userId],
    references: [users.id],
  }),
}));

export const academyReferralRelationshipsRelations = relations(academyReferralRelationships, ({ one }) => ({
  referredUser: one(users, {
    fields: [academyReferralRelationships.referredUserId],
    references: [users.id],
  }),
  referrerUser: one(users, {
    fields: [academyReferralRelationships.referrerUserId],
    references: [users.id],
  }),
}));

export type AcademyReferralCode = typeof academyReferralCodes.$inferSelect;
export type AcademyReferralRelationship = typeof academyReferralRelationships.$inferSelect;
