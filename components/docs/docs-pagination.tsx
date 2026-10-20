import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAdjacentDocs } from "@/lib/docs/navigation";

export function DocsPagination({ slug }: { slug: string }) {
  const { prev, next } = getAdjacentDocs(slug);
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Adjacent documentation pages"
      className="mt-12 grid gap-3 border-t border-foreground/10 pt-8 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 transition hover:border-[var(--accent)]/30 hover:bg-foreground/[0.04]"
        >
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
            <ArrowLeft className="h-3 w-3" />
            Previous
          </span>
          <span className="mt-1 block text-sm font-medium text-foreground group-hover:text-[var(--accent)]">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          className="group rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 text-right transition hover:border-[var(--accent)]/30 hover:bg-foreground/[0.04]"
        >
          <span className="inline-flex items-center justify-end gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
            Next
            <ArrowRight className="h-3 w-3" />
          </span>
          <span className="mt-1 block text-sm font-medium text-foreground group-hover:text-[var(--accent)]">
            {next.title}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
