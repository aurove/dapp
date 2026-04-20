import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-[var(--border)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <p className="text-base font-semibold tracking-tight text-[var(--foreground)]">
            Fractals
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Fractional liquidity for locked Mezo Earn positions.
          </p>
        </div>
        <Link
          href="/app"
          className="text-sm font-medium text-[var(--foreground)] underline decoration-[var(--border)] underline-offset-4 transition hover:text-[var(--brand)] hover:decoration-[var(--brand)]"
        >
          Enter App
        </Link>
      </div>
    </footer>
  );
}
