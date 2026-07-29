"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { cn } from "@ui";

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Assign stable ids to h2/h3 in the article and return TOC items. */
export function collectAndTagHeadings(root: HTMLElement | null): TocItem[] {
  if (!root) return [];

  const headings = root.querySelectorAll("h2, h3");
  const used = new Map<string, number>();
  const items: TocItem[] = [];

  headings.forEach((node) => {
    const el = node as HTMLHeadingElement;
    const text = (el.textContent ?? "").trim();
    if (!text) return;

    const level = el.tagName === "H3" ? 3 : 2;
    const base = el.id || slugifyHeading(text) || `section-${items.length + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    if (el.id !== id) el.id = id;
    items.push({ id, text, level });
  });

  return items;
}

export function DocsTocNav({
  items,
  activeId,
  onNavigate,
  className,
}: {
  items: TocItem[];
  activeId: string | null;
  onNavigate?: (id: string) => void;
  className?: string;
}) {
  if (!items.length) {
    return (
      <p className={cn("text-xs text-white/35", className)}>No sections on this page.</p>
    );
  }

  return (
    <nav aria-label="On this page" className={className}>
      <ul className="space-y-0.5 border-l border-white/10">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  const target = document.getElementById(item.id);
                  if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                    window.history.replaceState(null, "", `#${item.id}`);
                    onNavigate?.(item.id);
                  }
                }}
                className={cn(
                  "-ml-px block border-l-2 py-1.5 text-[12.5px] leading-snug transition",
                  item.level === 3 ? "pl-5" : "pl-3",
                  active
                    ? "border-[#d2a45f] text-[#ecd09b]"
                    : "border-transparent text-white/45 hover:border-white/25 hover:text-white/80",
                )}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DocsTocSidebar({
  contentRef,
}: {
  contentRef: RefObject<HTMLElement | null>;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const next = collectAndTagHeadings(contentRef.current);
    setItems(next);

    if (typeof window !== "undefined" && window.location.hash) {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (next.some((item) => item.id === hash)) {
        setActiveId(hash);
        return;
      }
    }
    if (next[0]) {
      setActiveId((current) => {
        if (current && next.some((item) => item.id === current)) return current;
        return next[0].id;
      });
    }
  }, [contentRef]);

  useEffect(() => {
    // Defer until article HTML is committed (including nested client islands).
    const frame = window.requestAnimationFrame(() => refresh());
    const timer = window.setTimeout(() => refresh(), 50);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!items.length) return;

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
          return;
        }

        let current: string | null = null;
        for (const el of elements) {
          if (el.getBoundingClientRect().top <= 120) {
            current = el.id;
          }
        }
        if (current) setActiveId(current);
      },
      {
        rootMargin: "-100px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <>
      <aside className="hidden w-52 shrink-0 xl:block 2xl:w-56">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pl-1">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            On this page
          </p>
          <DocsTocNav items={items} activeId={activeId} onNavigate={setActiveId} />
        </div>
      </aside>

      <div className="mb-6 xl:hidden">
        {items.length > 0 ? (
          <details className="group rounded-2xl border border-white/10 bg-white/[0.02]">
            <summary className="cursor-pointer list-none px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                On this page
                <span className="text-white/35 transition group-open:rotate-180">▾</span>
              </span>
            </summary>
            <div className="border-t border-white/8 px-4 pb-4 pt-2">
              <DocsTocNav items={items} activeId={activeId} onNavigate={setActiveId} />
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}
