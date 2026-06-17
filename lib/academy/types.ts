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
