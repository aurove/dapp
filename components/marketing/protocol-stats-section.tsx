"use client";

import { memo, useEffect, useMemo, useState, type ComponentType } from "react";
import { Layers, Lock, Users, Wallet } from "lucide-react";
import { Skeleton } from "@ui";

import { MarketErrorBoundary } from "@/components/market/market-error-boundary";
import { useProtocolStats } from "@/hooks/use-protocol-stats";
import {
  formatCompactCount,
  formatCompactUsd,
  formatUpdatedAgo,
} from "@/lib/market/format";

type StatDefinition = {
  key: "tvl" | "wallets" | "ledger" | "id20";
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  format: (value: number | null | undefined) => string;
  select: (data: {
    tvlUsd: number | null;
    uniqueWallets: number | null;
    ledgerHolders: number | null;
    id20Holders: number | null;
  } | null | undefined) => number | null;
};

/** Mirrors homepage feature-card language: gold icon, quiet label, strong number. */
const STATS: readonly StatDefinition[] = [
  {
    key: "tvl",
    label: "Total value locked",
    icon: Lock,
    format: formatCompactUsd,
    select: (data) => data?.tvlUsd ?? null,
  },
  {
    key: "wallets",
    label: "Unique wallets",
    icon: Wallet,
    format: formatCompactCount,
    select: (data) => data?.uniqueWallets ?? null,
  },
  {
    key: "ledger",
    label: "Ledger holders",
    icon: Layers,
    format: formatCompactCount,
    select: (data) => data?.ledgerHolders ?? null,
  },
  {
    key: "id20",
    label: "id20 holders",
    icon: Users,
    format: formatCompactCount,
    select: (data) => data?.id20Holders ?? null,
  },
] as const;

type StatCardProps = {
  stat: StatDefinition;
  value: string;
  loading?: boolean;
};

const StatCard = memo(function StatCard({ stat, value, loading }: StatCardProps) {
  const Icon = stat.icon;

  return (
    <article
      className="protocol-stat-card"
      aria-label={loading ? `${stat.label}, loading` : `${stat.label}: ${value}`}
    >
      <div className="protocol-stat-card__icon-wrap" aria-hidden="true">
        <Icon className="protocol-stat-card__icon" />
      </div>

      <div className="protocol-stat-card__copy">
        {loading ? (
          <>
            <Skeleton className="protocol-stat-card__skeleton-value" />
            <Skeleton className="protocol-stat-card__skeleton-label" />
          </>
        ) : (
          <>
            <p className="protocol-stat-card__value">{value}</p>
            <p className="protocol-stat-card__label">{stat.label}</p>
          </>
        )}
      </div>
    </article>
  );
});

function ProtocolStatsSectionInner() {
  const { data, isPending, isError, dataUpdatedAt } = useProtocolStats();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const loading = isPending && !data;
  const fetchedAt = data?.fetchedAt ?? (dataUpdatedAt || null);

  const cards = useMemo(
    () =>
      STATS.map((stat) => ({
        stat,
        value: stat.format(stat.select(data)),
      })),
    [data],
  );

  return (
    <section
      className="landing-section landing-section--stats"
      aria-labelledby="protocol-stats-heading"
    >
      <div className="landing-container">
        <p className="section-kicker">PROTOCOL</p>
        <h2 id="protocol-stats-heading" className="section-title">
          Live network summary
        </h2>
        <p className="section-copy section-copy--stats" aria-live="polite">
          {isError && !data
            ? "Stats temporarily unavailable."
            : `On-chain metrics across Aurove contracts · ${formatUpdatedAgo(fetchedAt, now).replace(/^Updated /, "").toLowerCase()}`}
        </p>

        <div className="protocol-stats-grid" role="list">
          {cards.map(({ stat, value }) => (
            <div key={stat.key} role="listitem" className="protocol-stats-grid__item">
              <StatCard stat={stat} value={value} loading={loading} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProtocolStatsSection() {
  return (
    <MarketErrorBoundary
      label="protocol-stats"
      fallback={
        <section className="landing-section landing-section--stats">
          <div className="landing-container">
            <p className="section-kicker">PROTOCOL</p>
            <h2 className="section-title">Live network summary</h2>
            <p className="section-copy">Protocol stats are temporarily unavailable.</p>
          </div>
        </section>
      }
    >
      <ProtocolStatsSectionInner />
    </MarketErrorBoundary>
  );
}
