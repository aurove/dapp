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

function getDatabase(): DatabaseCache {
  if (globalForDb.__auroveDatabase) return globalForDb.__auroveDatabase;

  const client = postgres(getDatabaseUrl(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const database = drizzle(client, { schema });
  const cache = { client, db: database };
  // Cache in all environments so serverless warm instances reuse the pool,
  // and so Next.js build page-data collection does not connect until first use.
  globalForDb.__auroveDatabase = cache;
  return cache;
}

/**
 * Lazy DB handle: importing this module must not require DATABASE_URL.
 * Next.js collects page data for API routes at build time; eager connect
 * fails on Vercel projects that omit Academy/auth database env vars.
 */
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, property, receiver) {
      const instance = getDatabase().db;
      const value = Reflect.get(instance as object, property, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  },
);

export type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
