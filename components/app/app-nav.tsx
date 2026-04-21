"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CandlestickChart, WalletCards } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@fractals/ui/lib/cn";

type AppRoute = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const appRoutes: AppRoute[] = [
  { href: "/app", label: "Overview", icon: WalletCards },
  { href: "/app/trade", label: "Trade", icon: CandlestickChart },
  { href: "/app/earn", label: "Earn", icon: BarChart3 },
];

type AppNavProps = {
  variant?: "sidebar" | "bottom" | "inline";
  onSelect?: () => void;
};

export function AppNav({ variant = "inline", onSelect }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="App"
      className={cn(
        variant === "sidebar" && "flex flex-col gap-1",
        variant === "inline" && "flex flex-wrap items-center gap-2",
        variant === "bottom" && "flex items-center justify-around gap-1",
      )}
    >
      {appRoutes.map((route) => {
        const isActive =
          pathname === route.href ||
          (route.href !== "/app" && pathname.startsWith(`${route.href}/`));

        return (
          <Link
            key={route.href}
            href={route.href}
            onClick={onSelect}
            className={cn(
              "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1117]",
              variant === "sidebar" &&
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white",
              variant === "inline" &&
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white",
              variant === "bottom" &&
                "flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium text-white/65",
              isActive && "bg-white/10 text-white",
            )}
          >
            <route.icon className={cn("h-4 w-4", variant === "bottom" && "h-4 w-4")} />
            <span>{route.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
