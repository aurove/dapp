import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@ui";
import type { DocStatus } from "@/lib/docs/types";
import { StatusBadge } from "./status-badge";

export function DocsCard({
  title,
  description,
  href,
  status,
  icon,
  className,
}: {
  title: string;
  description: string;
  href: string;
  status?: DocStatus;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 transition",
        "hover:border-[#d2a45f]/35 hover:bg-white/[0.05]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#ecd09b]">
              {icon}
            </span>
          ) : null}
          <h3 className="text-[15px] font-semibold tracking-tight text-[#f6f3ef]">{title}</h3>
        </div>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-white/55">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#ecd09b] transition group-hover:gap-1.5">
        Explore
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}

export function DocsCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("my-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>
  );
}
