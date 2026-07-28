import { NextRequest } from "next/server";
import { createNoStoreJsonResponse } from "@/lib/server/http";

export const runtime = "nodejs";

type IncomingEvent = {
  type?: string;
  slug?: string;
  title?: string;
  path?: string;
  query?: string;
  resultCount?: number;
  source?: string;
};

/**
 * Docs analytics ingestion.
 * Stores are intentionally lightweight: structured console logs suitable for
 * platform log drains. Wire a warehouse / PostHog later without changing clients.
 */
export async function POST(request: NextRequest) {
  let body: {
    events?: IncomingEvent[];
    ts?: number;
    path?: string;
    referrer?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return createNoStoreJsonResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 25) : [];
  if (!events.length) {
    return createNoStoreJsonResponse({ ok: false, error: "No events" }, { status: 400 });
  }

  const summary = {
    received: events.length,
    types: events.reduce<Record<string, number>>((acc, event) => {
      const key = typeof event.type === "string" ? event.type : "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    path: body.path ?? null,
    referrer: body.referrer ?? null,
    clientTs: body.ts ?? null,
  };

  // Structured log for most-viewed pages / searches / empty searches
  console.info("[docs-analytics]", JSON.stringify({ summary, events }));

  return createNoStoreJsonResponse({ ok: true, received: events.length });
}
