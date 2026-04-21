import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Shield } from "lucide-react";
import { AppNav } from "@/components/app/app-nav";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { Web3Providers } from "@/lib/providers/web3-providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Web3Providers>
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col px-6 py-10 lg:px-8 lg:py-12">
        <header className="glass-card rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                <Shield className="h-3.5 w-3.5 text-[var(--accent)]" />
                Fractals App
              </p>
              <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)] sm:text-2xl">
                Structured liquidity operations for veBTC / veMEZO
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <WalletConnectButton />
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-strong)]"
              >
                Marketing Site
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <AppNav />
          </div>
        </header>
        <main className="mt-6 flex-1">{children}</main>
      </div>
    </Web3Providers>
  );
}
