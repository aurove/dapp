import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "drizzle-kit";

function readLocalEnvValue(key: string): string | undefined {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const content = readFileSync(envPath, "utf8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) {
    return undefined;
  }

  const raw = match[1].trim();
  if (
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  ) {
    return raw.slice(1, -1);
  }

  return raw || undefined;
}

function getDatabaseUrl(): string {
  const value = readLocalEnvValue("DATABASE_URL");
  if (!value) {
    throw new Error("DATABASE_URL is not configured for Drizzle Kit.");
  }

  return value;
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
