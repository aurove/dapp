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
        "docs-prose max-w-none text-[15px] leading-7 text-white/72",
        "[&>h1]:mb-4 [&>h1]:text-3xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:text-[#f6f3ef]",
        "[&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:scroll-mt-28 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:tracking-tight [&>h2]:text-[#f6f3ef]",
        "[&>h3]:mt-7 [&>h3]:mb-2 [&>h3]:scroll-mt-28 [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-[#f0ebe3]",
        "[&>p]:my-3 [&>p]:text-white/70",
        "[&>ul]:my-3 [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5",
        "[&>ol]:my-3 [&>ol]:list-decimal [&>ol]:space-y-1.5 [&>ol]:pl-5",
        "[&>li]:text-white/70",
        "[&>hr]:my-8 [&>hr]:border-white/10",
        "[&_a]:text-[#ecd09b] [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_strong]:font-semibold [&_strong]:text-[#f6f3ef]",
        "[&_code]:rounded-md [&_code]:border [&_code]:border-white/10 [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[#ecd09b]",
        "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border-b [&_th]:border-white/12 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_th]:text-white/45",
        "[&_td]:border-b [&_td]:border-white/8 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-white/70",
        className,
      )}
    >
      {children}
    </div>
  );
}
