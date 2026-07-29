const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const standardUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const microUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

/** Format a mUSD price for ticker display (uses $ as the mUSD unit label). */
export function formatTickerPrice(priceMusd: number | null | undefined): string {
  if (priceMusd == null || !Number.isFinite(priceMusd)) return "—";
  const abs = Math.abs(priceMusd);
  if (abs >= 1_000) return compactUsd.format(priceMusd);
  if (abs >= 1) return standardUsd.format(priceMusd);
  if (abs >= 0.0001) return microUsd.format(priceMusd);
  if (abs === 0) return "$0.00";
  return priceMusd.toExponential(2);
}

/** Format a 24h percent change for the ticker. */
export function formatChangePct(change24hPct: number | null | undefined): string {
  if (change24hPct == null || !Number.isFinite(change24hPct)) return "—";
  const sign = change24hPct > 0 ? "+" : "";
  return `${sign}${change24hPct.toFixed(2)}%`;
}

/** Compact count / TVL helpers for protocol stats. */
export function formatCompactCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1_000) return new Intl.NumberFormat("en-US").format(Math.round(value));
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1_000) return standardUsd.format(value);
  return compactUsd.format(value);
}

export function formatUpdatedAgo(fetchedAtMs: number | null | undefined, now = Date.now()): string {
  if (fetchedAtMs == null || !Number.isFinite(fetchedAtMs)) return "Updated —";
  const deltaSec = Math.max(0, Math.floor((now - fetchedAtMs) / 1000));
  if (deltaSec < 45) return "Updated just now";
  if (deltaSec < 90) return "Updated 1 min ago";
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `Updated ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "Updated 1 hr ago" : `Updated ${hours} hr ago`;
}
