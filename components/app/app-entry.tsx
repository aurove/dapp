import Link from "next/link";

const modules = [
  {
    title: "Fraction Market",
    status: "Primary Surface",
    summary:
      "List, bid, buy, and sell veBTC / veMEZO fractional claims across structured secondary liquidity.",
  },
  {
    title: "Settlement Windows",
    status: "Protocol Flow",
    summary:
      "Track active and upcoming windows for redemption, claim settlement, and orderly rollover actions.",
  },
  {
    title: "Yield Routing",
    status: "Optimisation",
    summary:
      "Route position exposure through managed yield paths designed around lock duration and rollover logic.",
  },
  {
    title: "Portfolio & Risk",
    status: "Control Layer",
    summary:
      "Inspect fractional inventory, valuation context, lock maturity profile, and transfer activity in one view.",
  },
] as const;

export function AppEntry() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10 lg:px-8 lg:py-14">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Fractals Application
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
            Structured liquidity operations for locked ve exposure.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            This is the operating surface for fractional markets, settlement windows, rollover
            actions, and managed yield routes for veBTC and veMEZO positions.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          Back to Overview
        </Link>
      </header>

      <section className="grid gap-4 py-8 md:grid-cols-2">
        {modules.map((module) => (
          <article key={module.title} className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                {module.title}
              </h2>
              <p className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
                {module.status}
              </p>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{module.summary}</p>
          </article>
        ))}
      </section>

      <section className="protocol-panel grid-overlay rounded-3xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          Current Build Direction
        </p>
        <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--foreground)] sm:grid-cols-3">
          <p className="glass-card rounded-xl p-4">
            Expose market and order primitives for fractional veBTC / veMEZO claims.
          </p>
          <p className="glass-card rounded-xl p-4">
            Integrate settlement and rollover orchestration with strong state visibility.
          </p>
          <p className="glass-card rounded-xl p-4">
            Connect position analytics with optimised yield routing across lock durations.
          </p>
        </div>
      </section>
    </main>
  );
}
