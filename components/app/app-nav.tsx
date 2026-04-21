"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CandlestickChart, WalletCards } from "lucide-react";
import type { ComponentType } from "react";

type AppRoute = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const routes: AppRoute[] = [
  { href: "/app", label: "Overview", icon: WalletCards },
  { href: "/app/trade", label: "Trade", icon: CandlestickChart },
  { href: "/app/earn", label: "Earn", icon: BarChart3 },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="App" className="flex flex-wrap items-center gap-2">
      {routes.map((route) => {
        const isActive = pathname === route.href;

        return (
          <Link
            key={route.href}
            href={route.href}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
              isActive
                ? "border-[color:color-mix(in_srgb,var(--brand)_65%,white_35%)] bg-[var(--brand)] text-[#06110a]"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            <route.icon className="h-4 w-4" />
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
