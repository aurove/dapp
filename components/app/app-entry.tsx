import Link from "next/link";
import { ArrowRightLeft, Coins, Layers3, TrendingUp } from "lucide-react";

const stats = [
  { label: "Active Fraction Books", value: "12", change: "+3 this epoch", icon: Layers3 },
  { label: "24h Matched Volume", value: "$3.8M", change: "+14.2%", icon: ArrowRightLeft },
  { label: "Open Settlement Value", value: "$7.4M", change: "2 windows", icon: Coins },
  { label: "Yield Routes Live", value: "6", change: "Optimised", icon: TrendingUp },
] as const;

export function AppEntry() {
  return (
    <section className="space-y-6">
      <div className="protocol-panel grid-overlay rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          Overview
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
          Dashboard for fractional liquidity, settlement windows, and yield routing.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
          Monitor the full ve position lifecycle: fraction issuance, secondary market activity,
          settlement readiness, and rollover routing in one operating surface.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/trade"
            className="rounded-full border border-[color:color-mix(in_srgb,var(--brand)_65%,white_35%)] bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[#06110a]"
          >
            Open Trade
          </Link>
          <Link
            href="/app/earn"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)]"
          >
            Open Earn
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {stat.label}
              </p>
              <stat.icon className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{stat.change}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="glass-card rounded-2xl p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Settlement Queue
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">Upcoming windows</h3>
          <ul className="mt-4 space-y-3 text-sm text-[var(--muted)]">
            <li className="flex items-center justify-between">
              <span>Epoch 142</span>
              <span>Opens in 08h 12m</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Epoch 143</span>
              <span>Opens in 2d 04h</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Epoch 144</span>
              <span>Opens in 5d 01h</span>
            </li>
          </ul>
        </article>

        <article className="glass-card rounded-2xl p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Route Health
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">Yield path spread</h3>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Current route optimiser indicates strongest weighted carry on 6-9 month duration bands
            with lower implied rollover friction versus manual position management.
          </p>
        </article>
      </div>
    </section>
  );
}
