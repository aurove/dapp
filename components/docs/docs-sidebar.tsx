"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { cn, ScrollArea, Sheet, SheetContent, SheetTrigger, buttonVariants } from "@ui";
import { DOCS_NAV } from "@/lib/docs/navigation";
import { StatusBadge } from "./status-badge";

function NavTree({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeSlug = pathname?.replace(/^\/docs\/?/, "") || "";

  const initiallyOpen = useMemo(() => {
    const open = new Set<string>();
    for (const section of DOCS_NAV) {
      if (section.items.some((item) => item.slug === activeSlug || activeSlug.startsWith(`${item.slug}/`))) {
        open.add(section.title);
      }
    }
    // Default first section open on landing
    if (!activeSlug) open.add(DOCS_NAV[0]?.title ?? "");
    return open;
  }, [activeSlug]);

  const [openSections, setOpenSections] = useState<Set<string>>(initiallyOpen);

  function toggle(title: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <nav aria-label="Documentation" className="space-y-1 pb-8">
      <Link
        href="/docs"
        onClick={onNavigate}
        className={cn(
          "mb-3 block rounded-xl px-3 py-2 text-sm font-medium transition",
          pathname === "/docs"
            ? "bg-[#d2a45f]/12 text-[#f0e2c8]"
            : "text-white/60 hover:bg-white/5 hover:text-white",
        )}
      >
        Documentation home
      </Link>

      {DOCS_NAV.map((section) => {
        const isOpen = openSections.has(section.title);
        return (
          <div key={section.title} className="pt-1">
            <button
              type="button"
              onClick={() => toggle(section.title)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40 transition hover:text-white/70"
              aria-expanded={isOpen}
            >
              {section.title}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", isOpen ? "rotate-0" : "-rotate-90")}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <ul className="mt-0.5 space-y-0.5 border-l border-white/8 ml-3 pl-2">
                {section.items.map((item) => {
                  const href = `/docs/${item.slug}`;
                  const active = activeSlug === item.slug;
                  return (
                    <li key={item.slug}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition",
                          active
                            ? "bg-white/10 text-white"
                            : "text-white/55 hover:bg-white/5 hover:text-white/90",
                        )}
                      >
                        <span className="truncate">{item.title}</span>
                        {item.status && item.status !== "live" ? (
                          <StatusBadge status={item.status} className="hidden xl:inline-flex scale-90" />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function DocsSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)]">
        <ScrollArea className="h-[calc(100vh-6rem)] pr-3">
          <NavTree />
        </ScrollArea>
      </div>
    </aside>
  );
}

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 flex items-center gap-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "gap-2 border border-white/10 bg-white/5",
          })}
        >
          <Menu className="h-4 w-4" />
          Menu
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(100%,20rem)] border-white/10 bg-[#0a0f15] p-0">
          <div className="border-b border-white/10 px-4 py-4">
            <p className="text-sm font-semibold text-white">Documentation</p>
            <p className="mt-0.5 text-xs text-white/45">Browse topics</p>
          </div>
          <ScrollArea className="h-[calc(100vh-5rem)] px-3 py-3">
            <NavTree onNavigate={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
