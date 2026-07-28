import { cn } from "@ui";
import type { DocStatus } from "@/lib/docs/types";

const LABELS: Record<DocStatus, string> = {
  live: "Live on Testnet",
  "in-development": "In Development",
  planned: "Planned",
};

const STYLES: Record<DocStatus, string> = {
  live: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
  "in-development": "border-sky-400/25 bg-sky-500/10 text-sky-100",
  planned: "border-white/15 bg-white/5 text-white/65",
};

export function StatusBadge({
  status,
  className,
}: {
  status: DocStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
