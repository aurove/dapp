import Link from "next/link";

const highlights = [
  "Fractionalised veBTC / veMEZO exposure",
  "Transferable liquidity from locked positions",
  "Optimised yield routing with structured settlement",
] as const;

export function HeroSection() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-16 px-6 pb-16 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:px-8 lg:pt-28">
      <div className="fade-up space-y-10">
        <p className="inline-flex rounded-full border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_90%,black_10%)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          Structured Liquidity Layer
        </p>
        <div className="space-y-7">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.02em] text-[var(--foreground)] sm:text-5xl lg:text-[3.8rem]">
            Fractional liquidity for locked veBTC and veMEZO positions.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-[var(--muted)] sm:text-[1.08rem]">
            Fractals transforms time-locked Mezo Earn positions into transferable claims, so you can
            keep long-duration exposure while improving exits, ownership flexibility, and yield
            outcomes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/app"
            className="rounded-full border border-[color:color-mix(in_srgb,var(--brand)_65%,white_35%)] bg-[var(--brand)] px-6 py-3 text-sm font-medium text-[#0b0f12] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
          >
            Enter App
          </Link>
          <a
            href="#how-it-works"
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-6 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
          >
            How It Works
          </a>
        </div>
        <ul className="grid gap-2 pt-2 text-sm text-[var(--muted)]">
          {highlights.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="fade-up relative">
        <div className="protocol-panel grid-overlay relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Protocol Pane
            </p>
            <p className="rounded-full border border-[var(--border)] bg-[var(--brand-soft)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
              Live Settlement Window
            </p>
          </div>

          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                Locked Base Position
              </p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-xl font-semibold">veBTC / veMEZO</p>
                <p className="text-sm text-[var(--muted)]">Duration: 24m</p>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                Fractional Claim Surface
              </p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-xl font-semibold">Transferable Units</p>
                <p className="text-sm text-[var(--muted)]">List / Bid / Buy / Sell</p>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                Yield Routing Layer
              </p>
              <div className="mt-3 flex items-end justify-between">
                <p className="text-xl font-semibold">Managed Rollover</p>
                <p className="text-sm text-[var(--muted)]">Optimised Settlement</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
