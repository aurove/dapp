import { Skeleton } from "@fractals/ui/components/ui/skeleton";

export function TradeLoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[var(--line)] p-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="mt-3 h-5 w-1/3" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
