import "server-only";

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return value;
}

type DatabaseCache = {
  client: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<typeof schema>;
};

const globalForDb = globalThis as typeof globalThis & {
  __auroveDatabase?: DatabaseCache;
};

const databaseCache = globalForDb.__auroveDatabase;

const client =
  databaseCache?.client ??
  postgres(getDatabaseUrl(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

const db = databaseCache?.db ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__auroveDatabase = { client, db };
}

export { db };
export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
