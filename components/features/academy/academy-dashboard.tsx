"use client";

import { AcademyDashboardView } from "./academy-dashboard-view";
import { useAcademyDashboard } from "./use-academy-dashboard";

export function AcademyDashboard() {
  const {
    summaryQuery,
    leaderboardQuery,
    leaderboardPage,
    setLeaderboardPage,
  } = useAcademyDashboard();

  return (
    <AcademyDashboardView
      summary={summaryQuery.data ?? null}
      leaderboard={leaderboardQuery.data ?? null}
      isSummaryLoading={summaryQuery.isLoading}
      isLeaderboardLoading={leaderboardQuery.isLoading}
      leaderboardPage={leaderboardPage}
      onLeaderboardPageChange={setLeaderboardPage}
    />
  );
}
