"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  requestAcademyCheckIn,
  requestAcademyCheckInState,
  requestAcademyLeaderboard,
  requestAcademySummary,
} from "@/lib/academy/client";
import type { AcademyLeaderboardEntry, AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (sessionKey: string) => ["academy", "summary", sessionKey] as const,
  leaderboard: (page: number, limit: number, sessionKey: string) =>
    ["academy", "leaderboard", page, limit, sessionKey] as const,
  checkIn: (sessionKey: string) => ["academy", "check-in", sessionKey] as const,
};

export function useAcademyDashboard(
  initialLeaderboard: AcademyLeaderboardPage | null,
  initialSummary: AcademySummary | null,
  initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null,
) {
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const leaderboardLimit = 10;
  const queryClient = useQueryClient();
  const { chainId, isAuthenticated, user, walletAddress, walletAddressNormalized } = useWalletAuth();
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : "guest";
  const sessionKey = `${walletKey}:${isAuthenticated && user ? user.id : "guest"}`;
  const checkInEnabled = Boolean(walletAddressNormalized && chainId);

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

  const checkInQuery = useQuery({
    queryKey: academyQueryKeys.checkIn(sessionKey),
    queryFn: requestAcademyCheckInState,
    enabled: checkInEnabled,
    staleTime: 15_000,
  });

  const checkInMutation = useMutation({
    mutationFn: requestAcademyCheckIn,
    onSuccess: async (result) => {
      queryClient.setQueryData(academyQueryKeys.checkIn(sessionKey), result.checkIn);
      queryClient.setQueryData(academyQueryKeys.summary(sessionKey), result.summary);
      await queryClient.invalidateQueries({ queryKey: ["academy", "leaderboard"] });
    },
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
    checkInQuery,
    checkInMutation,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardLimit,
    currentUserLeaderboardEntry,
  };
}
