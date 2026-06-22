import { ACADEMY_POINTS_PRECISION, ACADEMY_POINTS_SCALE } from "./constants";
import { formatUnitsDecimal } from "../formatting/decimal";

export function toAcademyReferralUnits(value: number | string | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) {
    return 0n;
  }

  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  const paddedFraction = `${fractionPart}${"0".repeat(ACADEMY_POINTS_PRECISION)}`.slice(
    0,
    ACADEMY_POINTS_PRECISION,
  );
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(paddedFraction);
  const units = whole * ACADEMY_POINTS_SCALE + fraction;
  return negative ? -units : units;
}

export function formatAcademyReferralPoints(value: number | string | bigint): string {
  const units = typeof value === "bigint" ? value : toAcademyReferralUnits(value);
  return formatUnitsDecimal(units, ACADEMY_POINTS_PRECISION, 5);
}
