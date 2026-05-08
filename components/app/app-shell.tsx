"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, ShieldCheck } from "lucide-react";
import { Badge } from "@fractals/ui/ui/badge";
import { AppNav } from "@/components/app/app-nav";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useChainId } from "wagmi";

export function AppShell({ children }: { children: React.ReactNode }) {
  const chainId = useChainId();
  const expectedChain = useMemo(() => getActiveChain(resolveAppEnvironment()), []);
  const wrongNetwork = chainId !== undefined && chainId !== expectedChain.id;
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f15]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-white"
            >
              <span className="text-lg font-semibold tracking-tight">Fractals</span>
            </Link>
            <div className="hidden lg:block">
              <AppNav variant="inline" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <WalletConnectButton />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
          <Badge className="normal-case tracking-normal border-white/20 bg-white/5 text-xs text-white/70">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Fractals protocol surface
          </Badge>
          <Badge
            className={
              wrongNetwork
                ? "normal-case tracking-normal border-red-400/30 bg-red-500/10 text-red-100"
                : "normal-case tracking-normal border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            }
          >
            <BellRing className="mr-1 h-3.5 w-3.5" />
            {wrongNetwork
              ? `Wrong network (expected ${expectedChain.name})`
              : `Network ${expectedChain.name}`}
          </Badge>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <main>{children}</main>
      </div>

      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 pt-2 text-xs text-white/40 md:px-6">
        <p>
          © {year} Fractals. This interface reflects configured contract state. Verify transaction
          details and destination contracts before signing.
        </p>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0a0f15]/96 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_36px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
        <AppNav variant="bottom" />
      </div>
    </div>
  );
}
