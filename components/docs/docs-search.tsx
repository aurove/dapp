"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { cn, Dialog, DialogContent, DialogTitle, Input } from "@ui";
import { trackDocsEvent } from "@/lib/docs/analytics";
import { searchDocs, type DocSearchResult } from "@/lib/docs/search";
import type { DocSearchDocument } from "@/lib/docs/types";

export function DocsSearch({ documents }: { documents: DocSearchDocument[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTrackedQuery = useRef("");

  const results = useMemo(() => searchDocs(documents, query, 10), [documents, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isK = event.key.toLowerCase() === "k";
      if ((event.metaKey || event.ctrlKey) && isK) {
        event.preventDefault();
        setOpen(true);
        trackDocsEvent({ type: "docs_search_open" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    if (lastTrackedQuery.current === q) return;
    const handle = window.setTimeout(() => {
      lastTrackedQuery.current = q;
      if (results.length === 0) {
        trackDocsEvent({ type: "docs_search_empty", query: q });
      } else {
        trackDocsEvent({ type: "docs_search", query: q, resultCount: results.length });
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [open, query, results.length]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  function onSelect(result: DocSearchResult) {
    trackDocsEvent({ type: "docs_topic_click", slug: result.slug, source: "search" });
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackDocsEvent({ type: "docs_search_open" });
        }}
        className={cn(
          "inline-flex h-9 w-full max-w-sm items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-left text-sm text-white/45 transition",
          "hover:border-white/20 hover:bg-white/[0.06] hover:text-white/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f]",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search docs…</span>
        <kbd className="hidden rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-white/45 sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden border-white/10 bg-[#0b1017] p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">Search documentation</DialogTitle>
          <div className="flex items-center gap-2 border-b border-white/10 px-3">
            <Search className="h-4 w-4 text-white/40" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, tags, and content…"
              className="h-12 border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (event.key === "Enter" && results[activeIndex]) {
                  event.preventDefault();
                  const target = results[activeIndex];
                  onSelect(target);
                  window.location.href = `/docs/${target.slug}`;
                } else if (event.key === "Escape") {
                  close();
                }
              }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
            {!query.trim() ? (
              <p className="px-3 py-6 text-center text-sm text-white/40">
                Type to search protocol concepts, user flows, contracts, and Academy topics.
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-white/40">
                No results for <span className="text-white/70">“{query.trim()}”</span>
              </p>
            ) : (
              <ul className="space-y-1">
                {results.map((result, index) => (
                  <li key={result.id}>
                    <Link
                      href={`/docs/${result.slug}`}
                      onClick={() => onSelect(result)}
                      className={cn(
                        "flex gap-3 rounded-xl px-3 py-2.5 transition",
                        index === activeIndex ? "bg-white/10" : "hover:bg-white/5",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#d2a45f]/90" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">{result.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-white/45">
                          {result.section} · {result.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
