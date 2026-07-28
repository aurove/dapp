import type { ReactNode } from "react";
import { AlertTriangle, Clock3, Info, ShieldAlert } from "lucide-react";
import { cn } from "@ui";

const variants = {
  info: {
    icon: Info,
    label: "Info",
    className: "border-sky-400/25 bg-sky-500/8 text-sky-50/95",
    iconClassName: "text-sky-300",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-50/95",
    iconClassName: "text-amber-300",
  },
  important: {
    icon: ShieldAlert,
    label: "Important",
    className: "border-[#d2a45f]/35 bg-[#d2a45f]/10 text-[#f6f3ef]",
    iconClassName: "text-[#ecd09b]",
  },
  "coming-soon": {
    icon: Clock3,
    label: "Coming soon",
    className: "border-white/15 bg-white/[0.04] text-white/80",
    iconClassName: "text-white/55",
  },
} as const;

export type CalloutVariant = keyof typeof variants;

export function Callout({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <aside
      className={cn(
        "my-6 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed",
        config.className,
        className,
      )}
    >
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconClassName)} aria-hidden />
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
            {title ?? config.label}
          </p>
          <div className="text-[13.5px] text-inherit/95 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-black/20 [&_code]:px-1 [&_p+p]:mt-2">
            {children}
          </div>
        </div>
      </div>
    </aside>
  );
}
