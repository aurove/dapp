"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requestAcademyLeaderboard, requestAcademySummary } from "@/lib/academy/client";
import type { AcademyLeaderboardEntry, AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (sessionKey: string) => ["academy", "summary", sessionKey] as const,
  leaderboard: (page: number, limit: number, sessionKey: string) =>
    ["academy", "leaderboard", page, limit, sessionKey] as const,
};

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function useAcademyDashboard(
  initialLeaderboard: AcademyLeaderboardPage | null,
  initialSummary: AcademySummary | null,
  initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leaderboardPage = parsePositiveInteger(searchParams.get("leaderboardPage")) ?? 1;
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

  const setLeaderboardPage = useCallback(
    (page: number) => {
      const nextPage = Number.isInteger(page) && page > 0 ? page : 1;
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) {
        params.delete("leaderboardPage");
      } else {
        params.set("leaderboardPage", String(nextPage));
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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
