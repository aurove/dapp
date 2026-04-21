import { SearchX } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";

type TradeEmptyStateProps = {
  onClear: () => void;
};

export function TradeEmptyState({ onClear }: TradeEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-8 text-center">
      <SearchX className="mx-auto h-8 w-8 text-white/50" />
      <h3 className="mt-3 text-lg font-semibold text-[var(--foreground)]">
        No markets available yet
      </h3>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Adjust filters or create a new listing to bootstrap market liquidity.
      </p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onClear}>
        Reset filters
      </Button>
    </div>
  );
}
