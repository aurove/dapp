"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, ShieldCheck } from "lucide-react";
import { Badge } from "@fractals/ui/ui/badge";
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
    <div className="relative isolate min-h-screen overflow-hidden bg-[#070b10] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(180deg,rgba(13,19,27,0.96)_0%,rgba(8,12,18,0.98)_46%,rgba(6,9,14,1)_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(125deg,rgba(196,160,106,0.13)_0%,rgba(196,160,106,0.035)_22%,transparent_44%),linear-gradient(235deg,rgba(72,99,132,0.16)_0%,rgba(72,99,132,0.035)_26%,transparent_55%)]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:72px_72px] opacity-55 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.8),rgba(0,0,0,0.42)_62%,transparent_100%)]" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0f15]/82 backdrop-blur-xl">
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
            <XAccountLink />
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

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <main>{children}</main>
      </div>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-8 pt-2 text-xs text-white/40 md:px-6">
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
