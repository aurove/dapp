import type { ReactNode } from "react";
import { cn } from "@ui";

/**
 * In-doc link to a live app or docs route.
 * Opens in a new tab so readers keep their place in documentation.
 */
export function DocRouteLink({
  href,
  children,
  className,
  code = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Render with mono path styling (for `/swap`, `/earn`, etc.). */
  code?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "text-[var(--accent)] underline-offset-4 transition hover:underline",
        code &&
          "rounded-md border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-mono text-[12.5px] no-underline hover:border-[var(--accent)]/35 hover:bg-[var(--accent)]/10",
        className,
      )}
    >
      {children}
    </a>
  );
}
