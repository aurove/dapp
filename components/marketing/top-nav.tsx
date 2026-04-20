import Link from "next/link";

const navItems = [
  { label: "Overview", href: "#overview" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Architecture", href: "#architecture" },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_92%,black_8%)]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
        <Link
          href="/"
          className="text-base font-semibold tracking-[0.01em] text-[var(--foreground)]"
        >
          Fractals
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <Link
          href="/app"
          className="rounded-full border border-[color:color-mix(in_srgb,var(--brand)_65%,white_35%)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[#0b0f12] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        >
          Enter App
        </Link>
      </div>
    </header>
  );
}
