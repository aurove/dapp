import { ACADEMY_TASK_USER_PERCENT } from "./constants";
import { formatAcademyReferralPoints, toAcademyReferralUnits } from "./units";

export function formatPoints(value: number | bigint | string): string {
  return formatAcademyReferralPoints(value);
}

function toAcademyPointsUnits(value: number | bigint | string): bigint {
  return toAcademyReferralUnits(value);
}

export function getAcademyTaskUserPoints(basePoints: number | bigint | string): string {
  const baseUnits = toAcademyPointsUnits(basePoints);
  const userUnits = (baseUnits * BigInt(ACADEMY_TASK_USER_PERCENT) + 50n) / 100n;

  return formatAcademyReferralPoints(userUnits);
}
