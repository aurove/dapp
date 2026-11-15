"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { LoaderCircle } from "lucide-react";
import { cn } from "@ui";
import {
  baseSepoliaChain,
  mezoTestnetChain,
  resolveAppEnvironment,
} from "@/lib/config/chains";
import { useAppChainSwitch } from "@/lib/web3/use-app-chain-switch";

const TESTNET_OPTIONS = [
  { chainId: mezoTestnetChain.id, label: "Mezo", shortName: mezoTestnetChain.name },
  { chainId: baseSepoliaChain.id, label: "Base", shortName: baseSepoliaChain.name },
] as const;

/**
 * Compact Mezo | Base wallet-network switcher for testnet.
 * Hidden on mainnet/local (single allowed chain).
 */
export function NetworkControl({ className }: { className?: string }) {
  const environment = resolveAppEnvironment();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchableChains, switchToChain, isAllowedChain } = useAppChainSwitch();
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (environment !== "testnet" || switchableChains.length < 2) {
    return null;
  }

  const onSelect = async (targetId: number) => {
    if (!isConnected || targetId === chainId || pendingId !== null) return;
    setPendingId(targetId);
    try {
      await switchToChain(targetId);
    } finally {
      setPendingId(null);
    }
  };

  const allowed = isAllowedChain(chainId);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--line)] bg-foreground/[0.03] p-0.5",
        !allowed && "border-red-400/40",
        className,
      )}
      role="group"
      aria-label="Wallet network"
    >
      {TESTNET_OPTIONS.map((option) => {
        const active = chainId === option.chainId;
        const pending = pendingId === option.chainId;
        return (
          <button
            key={option.chainId}
            type="button"
            disabled={!isConnected || pendingId !== null}
            title={
              isConnected
                ? `Switch wallet to ${option.shortName}`
                : "Connect a wallet to switch networks"
            }
            aria-pressed={active}
            onClick={() => void onSelect(option.chainId)}
            className={cn(
              "inline-flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-[var(--accent)] text-[var(--accent-foreground,#111)] shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {pending ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
