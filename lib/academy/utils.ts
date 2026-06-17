export function formatPoints(value: number | bigint | string): string {
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(numeric);
}
