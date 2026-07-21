"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { requestAcademyLeaderboard, requestAcademySummary } from "@/lib/academy/client";
import type { AcademyLeaderboardEntry, AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (sessionKey: string) => ["academy", "summary", sessionKey] as const,
  leaderboard: (page: number, limit: number, sessionKey: string) =>
    ["academy", "leaderboard", page, limit, sessionKey] as const,
};

export function useAcademyDashboard(
  initialLeaderboard: AcademyLeaderboardPage | null,
  initialSummary: AcademySummary | null,
  initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null,
) {
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const leaderboardLimit = 10;
  const { chainId, isAuthenticated, user, walletAddress, walletAddressNormalized } = useWalletAuth();
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : "guest";
  const sessionKey = `${walletKey}:${isAuthenticated && user ? user.id : "guest"}`;

  const summaryQuery = useQuery({
    queryKey: academyQueryKeys.summary(sessionKey),
    queryFn: requestAcademySummary,
    staleTime: 15_000,
    initialData: initialSummary ?? undefined,
  });

  const leaderboardQuery = useQuery({
    queryKey: academyQueryKeys.leaderboard(leaderboardPage, leaderboardLimit, "public"),
    queryFn: () => requestAcademyLeaderboard({ page: leaderboardPage, limit: leaderboardLimit }),
    staleTime: 15_000,
    initialData: leaderboardPage === 1 ? initialLeaderboard ?? undefined : undefined,
    placeholderData: keepPreviousData,
  });

  const currentUserLeaderboardEntry =
    !summaryQuery.data?.authenticated || !summaryQuery.data.rank
      ? null
      : initialCurrentUserLeaderboardEntry ??
        (user
          ? {
              userId: user.id,
              rank: summaryQuery.data.rank,
              walletAddress: walletAddress ?? user.walletAddress,
              totalPoints: summaryQuery.data.totalPoints,
              entryCount: 0,
              isCurrentUser: true,
            }
          : null);

  return {
    isAuthenticated,
    summaryQuery,
    leaderboardQuery,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardLimit,
    currentUserLeaderboardEntry,
  };
}
