"use client";

import { memo, useMemo } from "react";
import { Skeleton } from "@ui";

import { useMarketPrices } from "@/hooks/use-market-prices";
import { formatChangePct, formatTickerPrice } from "@/lib/market/format";
import type { MarketPriceQuote } from "@/lib/market/types";

import { MarketErrorBoundary } from "./market-error-boundary";

function ChangeBadge({ change24hPct }: { change24hPct: number | null }) {
  if (change24hPct == null || !Number.isFinite(change24hPct)) {
    return <span className="text-[11px] tabular-nums text-white/35">—</span>;
  }

  const positive = change24hPct > 0;
  const neutral = change24hPct === 0;
  const color = neutral
    ? "text-white/45"
    : positive
      ? "text-emerald-300"
      : "text-rose-300";
  const arrow = neutral ? "•" : positive ? "▲" : "▼";

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${color}`}>
      <span aria-hidden="true" className="text-[9px] leading-none">
        {arrow}
      </span>
      <span>{formatChangePct(change24hPct)}</span>
    </span>
  );
}

const TickerItem = memo(function TickerItem({ quote }: { quote: MarketPriceQuote }) {
  const label = `${quote.symbol} / ${quote.quoteSymbol}`;
  const priceText = formatTickerPrice(quote.priceMusd);
  const changeText = formatChangePct(quote.change24hPct);
  const direction =
    quote.change24hPct == null
      ? "unchanged"
      : quote.change24hPct > 0
        ? "up"
        : quote.change24hPct < 0
          ? "down"
          : "unchanged";

  return (
    <div
      className="flex shrink-0 items-baseline gap-2 px-3 sm:px-4"
      role="listitem"
      aria-label={`${label} price ${priceText}, 24 hour change ${changeText}, ${direction}`}
    >
      <span className="text-[11px] font-medium tracking-wide text-white/55 sm:text-xs">
        {quote.symbol}
      </span>
      <span className="text-[12px] font-semibold tabular-nums tracking-tight text-[var(--foreground)] sm:text-[13px]">
        {priceText}
      </span>
      <ChangeBadge change24hPct={quote.change24hPct} />
    </div>
  );
});

function TickerSkeleton() {
  return (
    <div className="flex items-center gap-6 px-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

function GlobalPriceTickerInner() {
  const { data, isPending, isError, isFetching } = useMarketPrices();

  const quotes = useMemo(() => data?.quotes ?? [], [data?.quotes]);
  const showSkeleton = isPending && !data;

  return (
    <div
      className="price-ticker sticky top-0 z-[60] border-b border-white/[0.07] bg-[#06090e]/95 backdrop-blur-md"
      data-fetching={isFetching ? "true" : "false"}
    >
      <div className="mx-auto flex h-9 w-full max-w-7xl items-center px-0 sm:px-2 md:px-4">
        <div
          className="flex w-full items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:justify-between md:overflow-visible"
          role="list"
          aria-label="Live token prices in mUSD"
          aria-busy={showSkeleton}
          aria-live="polite"
        >
          {showSkeleton ? (
            <TickerSkeleton />
          ) : isError && !data ? (
            <p className="px-4 text-[11px] text-white/40">Prices unavailable</p>
          ) : (
            quotes.map((quote) => <TickerItem key={quote.id} quote={quote} />)
          )}
        </div>
      </div>
    </div>
  );
}

export function GlobalPriceTicker() {
  return (
    <MarketErrorBoundary label="price-ticker">
      <GlobalPriceTickerInner />
    </MarketErrorBoundary>
  );
}
