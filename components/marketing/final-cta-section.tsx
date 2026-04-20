import Link from "next/link";

export function FinalCtaSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8 lg:py-20">
      <div className="glass-card rounded-3xl p-8 text-center shadow-[0_18px_46px_rgba(0,0,0,0.34)] sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Enter Fractals
        </p>
        <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
          Access the structured liquidity layer for locked veBTC and veMEZO exposure.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
          Move from manual lock management into a cleaner protocol surface for transferability,
          settlement, and yield routing.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--brand)_65%,white_35%)] bg-[var(--brand)] px-7 py-3 text-sm font-medium text-[#0b0f12] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Launch App
        </Link>
      </div>
    </section>
  );
}
