import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";

type ReadinessItem = {
  key: string;
  label: string;
  detail: string;
  ready: boolean;
};

type ListingReadinessPanelProps = {
  title?: string;
  isChecking: boolean;
  error?: string | null;
  onRefresh?: () => void;
  items: ReadinessItem[];
  allDone?: boolean;
  emptyLabel?: string;
};

export function ListingReadinessPanel({
  title = "Readiness checks",
  isChecking,
  error,
  onRefresh,
  items,
  allDone = false,
  emptyLabel = "All checks passed.",
}: ListingReadinessPanelProps) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          {title}
          {allDone ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
        </p>
        {isChecking ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing checks
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-[var(--foreground)]">{item.label}</p>
                <p className="text-xs text-[var(--muted)]">{item.detail}</p>
              </div>
              <span className="pt-0.5">
                {item.ready ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-label="Ready" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-300" aria-label="Action required" />
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-emerald-300">{emptyLabel}</p>
      )}

      {error ? (
        <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <p>{error}</p>
          {onRefresh ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
              Retry checks
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
