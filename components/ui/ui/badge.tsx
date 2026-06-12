import * as React from "react";
import { cn } from "../lib/cn";

function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--accent)]/55 bg-[var(--accent)]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
