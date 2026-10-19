import type { ReactNode } from "react";
import { cn } from "@ui";

export function DocsProse({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "docs-prose max-w-none text-[15px] leading-7 text-foreground/72",
        "[&>h1]:mb-4 [&>h1]:text-3xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:text-foreground",
        "[&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:scroll-mt-4 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:text-foreground",
        "[&>h3]:mt-7 [&>h3]:mb-2 [&>h3]:scroll-mt-4 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-foreground",
        "[&>p]:my-3 [&>p]:text-foreground/70",
        "[&>ul]:my-3 [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5",
        "[&>ol]:my-3 [&>ol]:list-decimal [&>ol]:space-y-1.5 [&>ol]:pl-5",
        "[&>li]:text-foreground/70",
        "[&>hr]:my-8 [&>hr]:border-foreground/10",
        "[&_a]:text-[var(--accent)] [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_code]:rounded-md [&_code]:border [&_code]:border-foreground/10 [&_code]:bg-foreground/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[var(--accent)]",
        "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border-b [&_th]:border-foreground/12 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-foreground/45",
        "[&_td]:border-b [&_td]:border-foreground/8 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-foreground/70",
        className,
      )}
    >
      {children}
    </div>
  );
}
