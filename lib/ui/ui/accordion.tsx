import * as React from "react";
import { cn } from "../lib/cn";

function Accordion({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3", className)} {...props} />;
}

function AccordionItem({
  className,
  title,
  children,
  defaultOpen = false,
}: {
  className?: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-xl border border-[var(--line)] bg-[linear-gradient(155deg,rgba(20,26,34,0.95),rgba(12,17,23,0.95))] p-5",
        className,
      )}
    >
      <summary className="cursor-pointer list-none text-base font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-start justify-between gap-3">
          {title}
          <span
            aria-hidden="true"
            className="mt-0.5 text-[var(--accent-soft)] transition group-open:rotate-45"
          >
            +
          </span>
        </span>
      </summary>
      <div className="pt-3 text-sm leading-relaxed text-[var(--muted)]">{children}</div>
    </details>
  );
}

export { Accordion, AccordionItem };
