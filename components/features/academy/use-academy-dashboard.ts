"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { requestAcademyLeaderboard, requestAcademySummary } from "@/lib/academy/client";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (walletKey: string) => ["academy", "summary", walletKey] as const,
  leaderboard: (page: number, limit: number, walletKey: string) =>
    ["academy", "leaderboard", page, limit, walletKey] as const,
};

export function useAcademyDashboard() {
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const leaderboardLimit = 10;
  const { chainId, walletAddressNormalized } = useWalletAuth();
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : "guest";

  const summaryQuery = useQuery({
    queryKey: academyQueryKeys.summary(walletKey),
    queryFn: requestAcademySummary,
    staleTime: 15_000,
  });

  const leaderboardQuery = useQuery({
    queryKey: academyQueryKeys.leaderboard(leaderboardPage, leaderboardLimit, walletKey),
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
