"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import {
  cn,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  buttonVariants,
} from "@ui";
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
    <nav aria-label="Documentation" className="space-y-1 pb-6">
      <Link
        href="/docs"
        onClick={onNavigate}
        className={cn(
          "mb-3 block rounded-xl px-3 py-2 text-sm font-medium transition",
          pathname === "/docs"
            ? "bg-[var(--accent)]/12 text-[var(--accent-soft)]"
            : "text-muted hover:bg-foreground/5 hover:text-foreground",
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
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-foreground/70"
              aria-expanded={isOpen}
            >
              {section.title}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", isOpen ? "rotate-0" : "-rotate-90")}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-foreground/8 pl-2">
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
                            ? "bg-foreground/10 text-foreground"
                            : "text-muted hover:bg-foreground/5 hover:text-foreground/90",
                        )}
                      >
                        <span className="truncate">{item.title}</span>
                        {item.status && item.status !== "live" ? (
                          <StatusBadge status={item.status} className="hidden scale-90 xl:inline-flex" />
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

/** Desktop left nav — stays put; only its own list scrolls if long. */
export function DocsSidebar() {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-foreground/5 py-4 pr-2 lg:flex md:py-6">
      <ScrollArea className="h-full pr-2">
        <NavTree />
      </ScrollArea>
    </aside>
  );
}

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3 flex items-center gap-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "gap-2 border border-foreground/10 bg-foreground/5",
          })}
        >
          <Menu className="h-4 w-4" />
          Menu
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(100%,20rem)] border-foreground/10 bg-chrome p-0">
          <div className="border-b border-foreground/10 px-4 py-4 pr-12">
            <SheetTitle className="text-sm font-semibold text-foreground">Documentation</SheetTitle>
            <SheetDescription className="mt-0.5 text-xs text-muted">
              Browse topics
            </SheetDescription>
          </div>
          <ScrollArea className="h-[calc(100vh-5rem)] px-3 py-3">
            <NavTree onNavigate={() => setOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
