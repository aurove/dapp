import Link from "next/link";

const navItems = [
  { label: "Swap", href: "/swap" },
  { label: "Liquidity", href: "/liquidity" },
  { label: "Earn", href: "/earn" },
  { label: "Docs", href: "/docs" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-white/10 py-9">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-base font-semibold tracking-tight text-[var(--foreground)]">Aurove</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Simple fungible Earn products for complex Mezo Earn exposure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-[var(--foreground)]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
