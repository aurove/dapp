"use client";

import Image from "next/image";
import type { Address } from "viem";

import { cn } from "@ui";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import type { LiquidityPortfolio } from "@/features/portfolio";

export type Position = LiquidityPortfolio["positions"][string];
export type TokenMeta = { symbol: string; decimals: number; address: Address; rawBalance: bigint };

export function amount(raw: bigint | undefined, token: TokenMeta | undefined) {
  if (raw === undefined || !token) return "Unavailable";
  return formatCompactRawTokenAmount(raw, token.decimals, token.symbol);
}

export function formatPercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)}%`;
}

export function tokenFamily(token: TokenMeta | undefined) {
  const symbol = token?.symbol.toUpperCase() ?? "";
  if (symbol.includes("BTC")) return "BTC";
  if (symbol.includes("MEZO")) return "MEZO";
  if (symbol.includes("AUROVE") || token?.symbol.toLowerCase().startsWith("av")) return "Aurove";
  return "MUSD";
}

export function TokenMark({ token, className }: { token?: TokenMeta; className?: string }) {
  const family = tokenFamily(token);
  return (
    <span
      className={cn(
        "grid shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#18222b]",
        className,
      )}
    >
      <Image
        src={`/tokens/${family}.png`}
        alt={`${token?.symbol ?? family} token`}
        width={32}
        height={32}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export function TokenPair({ token0, token1 }: { token0?: TokenMeta; token1?: TokenMeta }) {
  const marks = [
    { family: tokenFamily(token0), symbol: token0?.symbol ?? tokenFamily(token0) },
    { family: tokenFamily(token1), symbol: token1?.symbol ?? tokenFamily(token1) },
  ];
  return (
    <div className="relative h-11 w-16 shrink-0">
      {marks.map((mark, index) => (
        <span
          key={`${mark.family}-${index}`}
          className={cn(
            "absolute grid overflow-hidden rounded-full border-2 border-[#10161c] bg-[#18222b]",
            index === 0 ? "left-0 top-0 h-11 w-11" : "bottom-0 right-0 h-7 w-7",
          )}
        >
          <Image
            src={`/tokens/${mark.family}.png`}
            alt={`${mark.symbol} token`}
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </span>
      ))}
    </div>
  );
}

export function statusOf(position: Position) {
  if (position.liquidity === 0n) return { label: "Closed", help: "Closed — no active liquidity", tone: "border-white/15 bg-white/5 text-white/60" };
  if (position.isStaked) {
    if (position.currentTick === undefined) {
      return { label: "Staked", help: "Staked in gauge — earning emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" };
    }
    const active = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
    return active
      ? { label: "Staked · In range", help: "Staked and in range — earning swap fees and gauge emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" }
      : { label: "Staked · Out of range", help: "Staked but out of range — still earning gauge emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" };
  }
  if (position.currentTick === undefined) return { label: "Unavailable", help: "Pool status is temporarily unavailable", tone: "border-white/15 bg-white/5 text-white/60" };
  const active = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
  return active
    ? { label: "In range", help: "In range — earning swap fees", tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" }
    : { label: "Out of range", help: "Out of range — not currently earning swap fees", tone: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
}
