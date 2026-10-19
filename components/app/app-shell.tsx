"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { BellRing } from "lucide-react";
import { Badge } from "@ui";
import { AppNav } from "@/components/app/app-nav";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useChainId } from "wagmi";
import { XAccountLink } from "./x-account-link";

export function AppShell({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const expectedChain = useMemo(() => getActiveChain(resolveAppEnvironment()), []);
  const wrongNetwork = chainId !== undefined && chainId !== expectedChain.id;
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="app-shell-veil pointer-events-none fixed inset-0 z-0" />
      <div className="app-shell-glow pointer-events-none fixed inset-0 z-0" />
      <div className="app-shell-grid pointer-events-none fixed inset-0 z-0 opacity-55 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.8),rgba(0,0,0,0.42)_62%,transparent_100%)]" />
      {/* Fixed below the global price ticker (h-9 / 2.25rem). */}
      <header className="fixed inset-x-0 top-9 z-40 border-b border-[var(--line)] bg-chrome/92 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center rounded-xl pt-2 text-foreground">
              <span className="relative block h-6 w-[10rem] overflow-hidden sm:h-10 sm:w-[10.5rem]">
                <Image
                  src="/logo_mark.png"
                  alt="Aurove home"
                  fill
                  sizes="(min-width: 640px) 168px, 160px"
                  priority
                  className="object-cover object-center"
                />
              </span>
            </Link>
            <div className="hidden lg:block">
              <AppNav variant="inline" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <XAccountLink />
            <WalletConnectButton />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
          <Badge
            className={
              wrongNetwork
                ? "normal-case tracking-normal border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-100"
                : "normal-case tracking-normal border-emerald-400/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
            }
          >
            <BellRing className="mr-1 h-3.5 w-3.5" />
            {wrongNetwork
              ? `Wrong network (expected ${expectedChain.name})`
              : `Network ${expectedChain.name}`}
          </Badge>
        </div>
      </header>

      {/* Reserves vertical space for the fixed header (logo row + network badge). */}
      <div className="h-[6.75rem] shrink-0 sm:h-[7.25rem]" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <main>{children}</main>
      </div>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-8 pt-2 text-xs text-foreground/40 md:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} Aurove. This interface reflects configured contract state. Verify transaction
            details and destination contracts before signing.
          </p>
          <Link href="/docs" className="text-foreground/55 transition hover:text-foreground/80">
            Documentation
          </Link>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-chrome/96 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_36px_rgba(0,0,0,0.18)] backdrop-blur lg:hidden">
        <AppNav variant="bottom" />
      </div>
    </div>
  );
}
