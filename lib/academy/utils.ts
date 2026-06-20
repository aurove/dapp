import { ACADEMY_POINTS_SCALE, ACADEMY_TASK_USER_PERCENT } from "./constants";

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

function toAcademyPointsUnits(value: number | bigint | string): bigint {
  if (typeof value === "bigint") {
    return value * BigInt(ACADEMY_POINTS_SCALE);
  }

  const raw = typeof value === "number" ? value.toFixed(4) : String(value).trim();
  if (!raw) {
    return 0n;
  }

  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  const paddedFraction = `${fractionPart}0000`.slice(0, 4);
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(paddedFraction);
  const units = whole * BigInt(ACADEMY_POINTS_SCALE) + fraction;

  return negative ? -units : units;
}

export function getAcademyTaskUserPoints(basePoints: number | bigint | string): number {
  const baseUnits = toAcademyPointsUnits(basePoints);
  const userUnits = (baseUnits * BigInt(ACADEMY_TASK_USER_PERCENT) + 50n) / 100n;

  return Number(userUnits) / ACADEMY_POINTS_SCALE;
}
