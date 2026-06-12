import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@ui";
import { XAccountLink } from "../app/x-account-link";

const navItems = [
  { label: "Overview", href: "#overview" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Earn Products", href: "#earn-products" },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(8,11,15,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            Fractals
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "text-[13px] text-[var(--muted)] hover:text-[var(--foreground)]",
              })}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <XAccountLink />
          <Link href="/app" className={buttonVariants({ size: "sm", className: "gap-2" })}>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            Enter App
          </Link>
        </div>
      </div>
    </header>
  );
}
