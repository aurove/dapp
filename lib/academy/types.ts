import type { PointsProgram } from "@/lib/db/schema";

export type AcademySeason = PointsProgram;

export type AcademyLeaderboardEntry = {
  userId: string;
  rank: number;
  walletAddress: string;
  totalPoints: string;
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
  totalPoints: string;
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
  totalPoints: string;
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
  pointsDelta: string;
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

export type AcademyReferralActionResponse = {
  status: "pending" | "bound";
  referral: AcademyReferralSummary | null;
};
