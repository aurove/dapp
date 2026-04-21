import { Coins, Gauge, RefreshCcw, Timer } from "lucide-react";

const routes = [
  { name: "Stable Carry Route", apr: "13.2%", duration: "6-9 months", rollover: "Low" },
  { name: "Balanced Liquidity Route", apr: "16.7%", duration: "9-12 months", rollover: "Medium" },
  { name: "Long Conviction Route", apr: "21.4%", duration: "12-24 months", rollover: "Managed" },
] as const;

export function EarnPage() {
  return (
    <section className="space-y-6">
      <div className="protocol-panel rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          Earn
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
          Optimised yield routing for fractional ve exposure.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
          Allocate into managed routes designed around settlement windows and rollover mechanics,
          rather than manual lock handling.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <article className="glass-card rounded-2xl p-5 md:col-span-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Weighted Portfolio APY
            </p>
          </div>
          <p className="mt-3 text-3xl font-semibold text-[var(--foreground)]">17.8%</p>
        </article>
        <article className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Next Rollover</p>
          </div>
          <p className="mt-3 text-xl font-semibold text-[var(--foreground)]">08h 12m</p>
        </article>
        <article className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Claimable Yield
            </p>
          </div>
          <p className="mt-3 text-xl font-semibold text-[var(--foreground)]">$148,290</p>
        </article>
      </div>

      <article className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-[var(--accent)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Yield Routes
          </p>
        </div>
        <div className="mt-4 grid gap-3">
          {routes.map((route) => (
            <div
              key={route.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <p className="font-medium text-[var(--foreground)]">{route.name}</p>
              <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                <span>APR: {route.apr}</span>
                <span>Duration: {route.duration}</span>
                <span>Rollover: {route.rollover}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
