"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Award, BarChart3, BookOpen, Droplets } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@ui";

type AppRoute = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Match path prefixes beyond exact href (e.g. /docs/*). */
  matchPrefix?: string;
};

export const appRoutes: AppRoute[] = [
  { href: "/earn", label: "Earn", icon: BarChart3 },
  { href: "/#swap-interface", label: "Swap", icon: ArrowLeftRight },
  { href: "/liquidity", label: "Liquidity", icon: Droplets, matchPrefix: "/liquidity" },
  { href: "/academy", label: "Academy", icon: Award },
  { href: "/docs", label: "Docs", icon: BookOpen, matchPrefix: "/docs" },
];

function isRouteActive(pathname: string, route: AppRoute): boolean {
  if (route.href.startsWith("/#")) return false;
  if (pathname === route.href) return true;
  if (route.matchPrefix) {
    return pathname === route.matchPrefix || pathname.startsWith(`${route.matchPrefix}/`);
  }
  return route.href !== "/" && pathname.startsWith(`${route.href}/`);
}

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
        const isActive = isRouteActive(pathname, route);

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
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium text-white/65 sm:min-w-20 sm:px-3 sm:text-[11px]",
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
