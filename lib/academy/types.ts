import type { User } from "@/lib/db/auth-schema";
import type { PointsProgram } from "@/lib/db/schema";

export type AcademySeason = PointsProgram;

export type AcademySummaryUser = {
  id: User["id"];
  walletAddress: User["walletAddress"];
  walletAddressNormalized: User["walletAddressNormalized"];
  displayName: User["displayName"];
  avatarUrl: User["avatarUrl"];
  totalPoints: number;
  rank: number | null;
  lastActivityAt: string | null;
};

export type AcademyLeaderboardEntry = {
  userId: User["id"];
  rank: number;
  walletAddress: User["walletAddress"];
  walletAddressNormalized: User["walletAddressNormalized"];
  displayName: User["displayName"];
  avatarUrl: User["avatarUrl"];
  totalPoints: number;
  entryCount: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  isCurrentUser: boolean;
};

export type AcademyLeaderboardPage = {
  season: AcademySeason | null;
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  items: AcademyLeaderboardEntry[];
};

export type AcademySummary = {
  serverTime: string;
  authenticated: boolean;
  season: AcademySeason | null;
  user: AcademySummaryUser | null;
  totalPoints: number;
  rank: number | null;
};
