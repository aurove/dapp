import { relations, sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletAddress: text("wallet_address").notNull().unique(),
    walletAddressNormalized: text("wallet_address_normalized").notNull().unique(),
    chainId: bigint("chain_id", { mode: "number" }),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "users_wallet_address_normalized_lowercase",
      sql`${table.walletAddressNormalized} = lower(${table.walletAddressNormalized})`,
    ),
    index("users_chain_id_idx").on(table.chainId),
  ],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletAddressNormalized: text("wallet_address_normalized").notNull(),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "auth_challenges_wallet_address_normalized_lowercase",
      sql`${table.walletAddressNormalized} = lower(${table.walletAddressNormalized})`,
    ),
    index("auth_challenges_wallet_address_normalized_idx").on(table.walletAddressNormalized),
    index("auth_challenges_wallet_nonce_idx").on(table.walletAddressNormalized, table.nonce),
    index("auth_challenges_expires_at_idx").on(table.expiresAt),
    index("auth_challenges_used_at_idx").on(table.usedAt),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletAddressNormalized: text("wallet_address_normalized").notNull(),
    chainId: bigint("chain_id", { mode: "number" }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "auth_sessions_wallet_address_normalized_lowercase",
      sql`${table.walletAddressNormalized} = lower(${table.walletAddressNormalized})`,
    ),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_wallet_address_normalized_idx").on(table.walletAddressNormalized),
    index("auth_sessions_chain_id_idx").on(table.chainId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
    index("auth_sessions_revoked_at_idx").on(table.revokedAt),
  ],
);

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type AuthChallenge = typeof authChallenges.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
