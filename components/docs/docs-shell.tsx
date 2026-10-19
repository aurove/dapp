import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@ui";
import type { DocSearchDocument } from "@/lib/docs/types";
import { DocsMobileNav, DocsSidebar } from "./docs-sidebar";
import { DocsSearch } from "./docs-search";

export function DocsShell({
  children,
  searchDocuments,
}: {
  children: ReactNode;
  searchDocuments: DocSearchDocument[];
}) {
  return (
    <div className="relative isolate flex h-dvh flex-col overflow-hidden bg-background">
      <div className="app-shell-veil pointer-events-none fixed inset-0 z-0" />
      <div className="app-shell-glow pointer-events-none fixed inset-0 z-0" />

      {/* Top nav — fixed chrome, not part of content scroll */}
      <header className="relative z-40 shrink-0 border-b border-foreground/10 bg-chrome/92 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="inline-flex items-center rounded-xl text-foreground">
              <span className="relative block h-7 w-[7.5rem] overflow-hidden sm:h-8 sm:w-[8.5rem]">
                <Image
                  src="/logo_mark.png"
                  alt="Aurove"
                  fill
                  sizes="136px"
                  priority
                  className="object-cover object-center"
                />
              </span>
            </Link>
            <span className="hidden h-4 w-px bg-foreground/15 sm:block" aria-hidden />
            <Link
              href="/docs"
              className="hidden text-sm font-medium text-foreground/70 transition hover:text-foreground sm:inline"
            >
              Docs
            </Link>
          </div>

          <div className="hidden flex-1 justify-center px-4 md:flex">
            <DocsSearch documents={searchDocuments} />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/swap"
              className={buttonVariants({
                size: "sm",
                className: "gap-1.5",
              })}
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              Open app
            </Link>
          </div>
        </div>
        <div className="border-t border-foreground/5 px-4 py-2 md:hidden">
          <DocsSearch documents={searchDocuments} />
        </div>
      </header>

      {/* Body: left nav + main (height-locked; only content panes scroll) */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 gap-6 overflow-hidden px-4 md:gap-8 md:px-6">
        <DocsSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-4 md:py-6">
          <div className="shrink-0">
            <DocsMobileNav />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
