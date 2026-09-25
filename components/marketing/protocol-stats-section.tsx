"use client";

import { memo, useEffect, useState, type ComponentType } from "react";
import { Lock } from "lucide-react";
import { Skeleton } from "@ui";

import { MarketErrorBoundary } from "@/components/market/market-error-boundary";
import { useProtocolStats } from "@/hooks/use-protocol-stats";
import { formatCompactUsd, formatUpdatedAgo } from "@/lib/market/format";

type StatCardProps = {
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  value: string;
  loading?: boolean;
};

const StatCard = memo(function StatCard({ label, icon: Icon, value, loading }: StatCardProps) {
  return (
    <article
      className="protocol-stat-card"
      aria-label={loading ? `${label}, loading` : `${label}: ${value}`}
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
            <p className="protocol-stat-card__label">{label}</p>
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
  const tvlValue = formatCompactUsd(data?.tvlUsd ?? null);

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
            : `Aurove TVL from managed tranche supply and MUSD/avBTCm pool reserves · ${formatUpdatedAgo(fetchedAt, now).replace(/^Updated /, "").toLowerCase()}`}
        </p>

        <div className="protocol-stats-grid protocol-stats-grid--single" role="list">
          <div role="listitem" className="protocol-stats-grid__item">
            <StatCard
              label="Total value locked"
              icon={Lock}
              value={tvlValue}
              loading={loading}
            />
          </div>
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
