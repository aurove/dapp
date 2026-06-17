import type { PointsProgram } from "@/lib/db/schema";

export type AcademySeason = PointsProgram;

export type AcademyLeaderboardEntry = {
  userId: string;
  rank: number;
  walletAddress: string;
  totalPoints: number;
  entryCount: number;
  isCurrentUser: boolean;
};

export type AcademyLeaderboardPage = {
  season: AcademySeason | null;
  page: number;
  limit: number;
  totalPages: number;
  items: AcademyLeaderboardEntry[];
};

export type AcademySummary = {
  authenticated: boolean;
  season: AcademySeason | null;
  totalPoints: number;
  rank: number | null;
  referral: AcademyReferralSummary;
};

export type AcademyReferralSummary = {
  refId: string | null;
  referralLink: string | null;
  directCount: number;
  grandCount: number;
};

export type AcademyActivityUser = {
  id: string;
  walletAddress: string;
  totalPoints: number;
  rank: number | null;
  isCurrentUser: boolean;
};

export type AcademyActivityEntry = {
  id: string;
  activityDefinitionId: string;
  activityCode: string;
  activityName: string;
  sourceKind: string;
  sourceReference: string | null;
  sourceDetails: Record<string, unknown>;
  pointsDelta: number;
  occurredAt: string;
  recordedAt: string;
};

export type AcademyActivityPage = {
  season: AcademySeason | null;
  user: AcademyActivityUser | null;
  page: number;
  limit: number;
  totalPages: number;
  items: AcademyActivityEntry[];
};

export type AcademyCheckInState = {
  taskCode: "check_in";
  status: "success" | "cooldown";
  cooldownHours: number;
  pointsAwarded: number;
  lastCheckInAt: string | null;
  nextEligibleAt: string | null;
  secondsRemaining: number;
};

export type AcademyCheckInResponse = {
  summary: AcademySummary;
  checkIn: AcademyCheckInState;
};

export type AcademyReferralActionResponse = {
  status: "pending" | "bound";
  referral: AcademyReferralSummary | null;
};
