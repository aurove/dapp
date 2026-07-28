"use client";

import { Document } from "flexsearch";
import type { DocSearchDocument } from "./types";

export type DocSearchResult = DocSearchDocument & {
  score: number;
};

type SearchIndex = {
  index: Document<DocSearchDocument>;
  docs: Map<string, DocSearchDocument>;
};

let cached: SearchIndex | null = null;
let cachedCount = -1;

function createIndex(documents: DocSearchDocument[]): SearchIndex {
  const index = new Document<DocSearchDocument>({
    document: {
      id: "id",
      index: ["title", "description", "tags", "body", "section"],
      store: true,
    },
    tokenize: "forward",
    cache: true,
    encoder: "LatinBalance",
  });

  const docs = new Map<string, DocSearchDocument>();
  for (const doc of documents) {
    // Flatten tags array for indexing
    const indexed = {
      ...doc,
      tags: doc.tags.join(" "),
    } as unknown as DocSearchDocument;
    docs.set(doc.id, doc);
    index.add(indexed);
  }

  return { index, docs };
}

export function getOrBuildSearchIndex(documents: DocSearchDocument[]): SearchIndex {
  if (cached && cachedCount === documents.length) return cached;
  cached = createIndex(documents);
  cachedCount = documents.length;
  return cached;
}

function substringFallback(
  documents: DocSearchDocument[],
  query: string,
  limit: number,
): DocSearchResult[] {
  const lower = query.toLowerCase();
  const scored: DocSearchResult[] = [];

  for (const doc of documents) {
    const title = doc.title.toLowerCase();
    const description = doc.description.toLowerCase();
    const tags = doc.tags.join(" ").toLowerCase();
    const body = doc.body.toLowerCase();
    const section = doc.section.toLowerCase();

    let score = 0;
    if (title === lower) score += 100;
    else if (title.includes(lower)) score += 50;
    if (tags.includes(lower)) score += 30;
    if (description.includes(lower)) score += 20;
    if (section.includes(lower)) score += 10;
    if (body.includes(lower)) score += 5;

    // Token partials for light fuzzy feel
    const tokens = lower.split(/\s+/).filter((t) => t.length > 1);
    for (const token of tokens) {
      if (title.includes(token)) score += 8;
      if (tags.includes(token)) score += 5;
      if (body.includes(token)) score += 1;
    }

    if (score > 0) scored.push({ ...doc, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function searchDocs(
  documents: DocSearchDocument[],
  query: string,
  limit = 12,
): DocSearchResult[] {
  const q = query.trim();
  if (!q) return [];

  try {
    const { index, docs } = getOrBuildSearchIndex(documents);
    const fieldResults = index.search(q, {
      limit: limit * 4,
      enrich: true,
      suggest: true,
    }) as Array<{
      field?: string;
      result: Array<{ id: string | number; doc?: DocSearchDocument } | string | number>;
    }>;

    const scores = new Map<string, number>();
    const fieldBoost: Record<string, number> = {
      title: 8,
      tags: 6,
      description: 4,
      section: 3,
      body: 1,
    };

    for (const fieldHit of fieldResults) {
      const boost = fieldBoost[fieldHit.field ?? "body"] ?? 1;
      const rows = Array.isArray(fieldHit.result) ? fieldHit.result : [];
      rows.forEach((entry, rank) => {
        const id =
          typeof entry === "object" && entry !== null && "id" in entry
            ? String(entry.id)
            : String(entry);
        const prior = scores.get(id) ?? 0;
        scores.set(id, prior + boost * (limit * 4 - rank));
      });
    }

    if (scores.size > 0) {
      return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, score]) => {
          const doc = docs.get(id);
          if (!doc) return null;
          return { ...doc, score };
        })
        .filter((x): x is DocSearchResult => x !== null);
    }
  } catch {
    // Fall through to substring search
  }

  return substringFallback(documents, q, limit);
}
