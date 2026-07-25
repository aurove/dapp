"use client";

import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { requestAcademyLeaderboard, requestAcademySummary } from "@/lib/academy/client";
import type { AcademyLeaderboardEntry, AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";
import { getAcademyEpochNumber } from "@/lib/academy/epoch";
import { useWalletAuth } from "@/lib/auth/provider";

const academyQueryKeys = {
  summary: (sessionKey: string) => ["academy", "summary", sessionKey] as const,
  leaderboard: (mode: string, selector: number, sessionKey: string) =>
    ["academy", "leaderboard", mode, selector, sessionKey] as const,
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
  const leaderboardMode = initialLeaderboard?.mode ?? "epoch";
  const currentEpoch = getAcademyEpochNumber();
  const leaderboardPage = parsePositiveInteger(searchParams.get("leaderboardPage")) ?? 1;
  const requestedEpoch = parsePositiveInteger(searchParams.get("epoch"));
  const leaderboardEpoch =
    leaderboardMode === "global" ? null : requestedEpoch ?? initialLeaderboard?.epoch?.epoch ?? currentEpoch;
  const leaderboardSelector = leaderboardMode === "global" ? leaderboardPage : leaderboardEpoch ?? currentEpoch;
  const leaderboardLimit = 10;
  const { chainId, isAuthenticated, user, walletAddressNormalized } = useWalletAuth();
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : "guest";
  const sessionKey = `${walletKey}:${isAuthenticated && user ? user.id : "guest"}`;

  const summaryQuery = useQuery({
    queryKey: academyQueryKeys.summary(sessionKey),
    queryFn: requestAcademySummary,
    staleTime: 15_000,
    initialData: initialSummary ?? undefined,
  });

  const leaderboardQuery = useQuery({
    queryKey: academyQueryKeys.leaderboard(
      leaderboardMode,
      leaderboardSelector,
      sessionKey,
    ),
    queryFn: () =>
      leaderboardMode === "global"
        ? requestAcademyLeaderboard({ page: leaderboardPage, limit: leaderboardLimit })
        : requestAcademyLeaderboard({ epoch: leaderboardSelector }),
    staleTime: 15_000,
    initialData:
      leaderboardMode === "global"
        ? leaderboardPage === (initialLeaderboard?.page ?? 1)
          ? initialLeaderboard ?? undefined
          : undefined
        : leaderboardSelector === (initialLeaderboard?.epoch?.epoch ?? leaderboardSelector)
          ? initialLeaderboard ?? undefined
          : undefined,
    placeholderData: keepPreviousData,
  });

  const currentUserLeaderboardEntry =
    leaderboardMode === "global"
      ? leaderboardQuery.data?.items.find((entry) => entry.isCurrentUser) ?? initialCurrentUserLeaderboardEntry
      : null;

  const setLeaderboardPage = useCallback(
    (page: number) => {
      const nextPage = Number.isInteger(page) && page > 0 ? page : 1;
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) {
        params.delete("leaderboardPage");
      } else {
        params.set("leaderboardPage", String(nextPage));
      }
      params.delete("epoch");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setLeaderboardEpoch = useCallback(
    (epoch: number) => {
      const nextEpoch = Number.isInteger(epoch) && epoch > 0 ? epoch : currentEpoch;
      const params = new URLSearchParams(searchParams.toString());
      if (nextEpoch === currentEpoch) {
        params.delete("epoch");
      } else {
        params.set("epoch", String(nextEpoch));
      }
      params.delete("leaderboardPage");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [currentEpoch, pathname, router, searchParams],
  );

  return {
    isAuthenticated,
    leaderboardMode,
    summaryQuery,
    leaderboardQuery,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardEpoch,
    setLeaderboardEpoch,
    leaderboardLimit,
    currentUserLeaderboardEntry,
  };
}
