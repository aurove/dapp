"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { requestAcademyLeaderboard, requestAcademySummary } from "@/lib/academy/client";

const academyQueryKeys = {
  summary: ["academy", "summary"] as const,
  leaderboard: (page: number, limit: number) => ["academy", "leaderboard", page, limit] as const,
};

export function useAcademyDashboard() {
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const leaderboardLimit = 10;

  const summaryQuery = useQuery({
    queryKey: academyQueryKeys.summary,
    queryFn: requestAcademySummary,
    staleTime: 15_000,
  });

  const leaderboardQuery = useQuery({
    queryKey: academyQueryKeys.leaderboard(leaderboardPage, leaderboardLimit),
    queryFn: () => requestAcademyLeaderboard({ page: leaderboardPage, limit: leaderboardLimit }),
    staleTime: 15_000,
  });

  return {
    summaryQuery,
    leaderboardQuery,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardLimit,
  };
}
