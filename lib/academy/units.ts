import { formatUnits } from "viem";

import { ACADEMY_POINTS_PRECISION, ACADEMY_POINTS_SCALE } from "./constants";

function expandScientificDecimal(value: string): string {
  const match = value.match(/^(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) {
    return value;
  }

  const [, whole = "0", fraction = "", exponentText = "0"] = match;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError(`Academy points exponent is outside the supported range: ${value}`);
  }

  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;
  if (decimalIndex <= 0) {
    return `0.${"0".repeat(-decimalIndex)}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

export function toAcademyReferralUnits(value: number | string | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) {
    return 0n;
  }

  const negative = raw.startsWith("-");
  const normalized = expandScientificDecimal(negative ? raw.slice(1) : raw);
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) {
    throw new TypeError(`Invalid Academy points value: ${raw}`);
  }

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
  return formatUnits(units, ACADEMY_POINTS_PRECISION);
}
