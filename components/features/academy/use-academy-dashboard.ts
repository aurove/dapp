"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  requestAcademyCheckIn,
  requestAcademyCheckInState,
  requestAcademyLeaderboard,
  requestAcademySummary,
} from "@/lib/academy/client";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (walletKey: string) => ["academy", "summary", walletKey] as const,
  leaderboard: (page: number, limit: number, walletKey: string) =>
    ["academy", "leaderboard", page, limit, walletKey] as const,
  checkIn: (walletKey: string) => ["academy", "check-in", walletKey] as const,
};

export function useAcademyDashboard() {
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const leaderboardLimit = 10;
  const queryClient = useQueryClient();
  const { chainId, isAuthenticated, walletAddressNormalized } = useWalletAuth();
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : "guest";
  const checkInEnabled = Boolean(walletAddressNormalized && chainId);

  const summaryQuery = useQuery({
    queryKey: academyQueryKeys.summary(walletKey),
    queryFn: requestAcademySummary,
    staleTime: 15_000,
  });

  const leaderboardQuery = useQuery({
    queryKey: academyQueryKeys.leaderboard(leaderboardPage, leaderboardLimit, walletKey),
    queryFn: () => requestAcademyLeaderboard({ page: leaderboardPage, limit: leaderboardLimit }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const checkInQuery = useQuery({
    queryKey: academyQueryKeys.checkIn(walletKey),
    queryFn: requestAcademyCheckInState,
    enabled: checkInEnabled,
    staleTime: 15_000,
  });

  const checkInMutation = useMutation({
    mutationFn: requestAcademyCheckIn,
    onSuccess: async (result) => {
      queryClient.setQueryData(academyQueryKeys.checkIn(walletKey), result.checkIn);
      queryClient.setQueryData(academyQueryKeys.summary(walletKey), result.summary);
      await queryClient.invalidateQueries({ queryKey: ["academy", "leaderboard"] });
    },
  });

  return {
    isAuthenticated,
    summaryQuery,
    leaderboardQuery,
    checkInQuery,
    checkInMutation,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardLimit,
  };
}
