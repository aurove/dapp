import { ACADEMY_TASK_USER_PERCENT } from "./constants";
import { formatAcademyReferralPoints, toAcademyReferralUnits } from "./units";
import { formatCompactDecimal } from "../web3/value-parsers";

export function formatPoints(value: number | bigint | string): string {
  return formatCompactDecimal(formatAcademyReferralPoints(value));
}

export function toAcademyPointsUnits(value: number | bigint | string): bigint {
  return toAcademyReferralUnits(value);
}

export function getAcademyTaskUserPoints(basePoints: number | bigint | string): string {
  const baseUnits = toAcademyPointsUnits(basePoints);
  const userUnits = (baseUnits * BigInt(ACADEMY_TASK_USER_PERCENT) + 50n) / 100n;

  return formatAcademyReferralPoints(userUnits);
}
