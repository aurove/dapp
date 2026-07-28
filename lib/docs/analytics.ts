/**
 * Lightweight docs analytics.
 * Events are buffered client-side and POSTed to /api/docs/analytics.
 * There is no third-party analytics provider in the dapp yet; this module
 * is the integration point for page views, searches, and failed searches.
 */

export type DocsAnalyticsEvent =
  | {
      type: "docs_page_view";
      slug: string;
      title: string;
      path: string;
    }
  | {
      type: "docs_search";
      query: string;
      resultCount: number;
    }
  | {
      type: "docs_search_empty";
      query: string;
    }
  | {
      type: "docs_search_open";
    }
  | {
      type: "docs_topic_click";
      slug: string;
      source: "search" | "card" | "sidebar" | "related";
    };

const ENDPOINT = "/api/docs/analytics";
const BUFFER_KEY = "aurove.docs.analytics.buffer";
const MAX_BUFFER = 50;

function canUseDom(): boolean {
  return typeof window !== "undefined";
}

function readBuffer(): DocsAnalyticsEvent[] {
  if (!canUseDom()) return [];
  try {
    const raw = window.sessionStorage.getItem(BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DocsAnalyticsEvent[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_BUFFER) : [];
  } catch {
    return [];
  }
}

function writeBuffer(events: DocsAnalyticsEvent[]) {
  if (!canUseDom()) return;
  try {
    window.sessionStorage.setItem(BUFFER_KEY, JSON.stringify(events.slice(-MAX_BUFFER)));
  } catch {
    // ignore quota / private mode
  }
}

async function flush(events: DocsAnalyticsEvent[]) {
  if (!events.length || !canUseDom()) return;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events,
        ts: Date.now(),
        path: window.location.pathname,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    });
  } catch {
    // Re-buffer on network failure
    writeBuffer([...readBuffer(), ...events].slice(-MAX_BUFFER));
  }
}

export function trackDocsEvent(event: DocsAnalyticsEvent) {
  if (!canUseDom()) return;

  // Always keep a local rolling buffer for debugging / future dashboards
  const next = [...readBuffer(), event].slice(-MAX_BUFFER);
  writeBuffer(next);

  // Fire-and-forget network delivery
  void flush([event]);
}

export function getDocsAnalyticsSnapshot(): DocsAnalyticsEvent[] {
  return readBuffer();
}
