"use client";

import type { AcademyLeaderboardEntry, AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";

import { AcademyActivityDialog } from "./academy-activity-dialog";
import { AcademyDashboardView } from "./academy-dashboard-view";
import { useAcademyActivity } from "./use-academy-activity";
import { useAcademyDashboard } from "./use-academy-dashboard";
import { useAcademyReferral } from "./use-academy-referral";
import { AcademyApiError } from "@/lib/academy/client";

type AcademyDashboardProps = {
  initialLeaderboard: AcademyLeaderboardPage | null;
  initialSummary: AcademySummary | null;
  initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null;
};

export function AcademyDashboard({
  initialLeaderboard,
  initialSummary,
  initialCurrentUserLeaderboardEntry,
}: AcademyDashboardProps) {
  const {
    isAuthenticated,
    leaderboardMode,
    summaryQuery,
    leaderboardQuery,
    leaderboardPage,
    setLeaderboardPage,
    leaderboardEpoch,
    setLeaderboardEpoch,
    currentUserLeaderboardEntry,
  } = useAcademyDashboard(
    initialLeaderboard,
    initialSummary,
    initialCurrentUserLeaderboardEntry,
  );
  useAcademyReferral();
  const seasonId = summaryQuery.data?.season?.id ?? leaderboardQuery.data?.season?.id ?? null;
  const activity = useAcademyActivity(seasonId);
  const summaryError = summaryQuery.error instanceof Error ? summaryQuery.error.message : null;
  const leaderboardError = leaderboardQuery.error instanceof Error ? leaderboardQuery.error.message : null;

  return (
    <>
      <AcademyDashboardView
        isAuthenticated={isAuthenticated}
        summary={summaryQuery.data ?? null}
        leaderboard={leaderboardQuery.data ?? null}
        currentUserLeaderboardEntry={currentUserLeaderboardEntry}
        leaderboardMode={leaderboardMode}
        summaryError={summaryError}
        leaderboardError={leaderboardError}
        isSummaryLoading={summaryQuery.isLoading}
        isLeaderboardLoading={leaderboardQuery.isLoading}
        leaderboardPage={leaderboardPage}
        onLeaderboardPageChange={setLeaderboardPage}
        leaderboardEpoch={leaderboardEpoch}
        onLeaderboardEpochChange={setLeaderboardEpoch}
        onLeaderboardUserOpen={activity.openActivityLog}
        onLeaderboardUserPrefetch={activity.prefetchActivityLog}
        onRetryAll={() => {
          void Promise.all([summaryQuery.refetch(), leaderboardQuery.refetch()]);
        }}
      />
      <AcademyActivityDialog
        open={activity.isOpen}
        onOpenChange={(next) => {
          if (!next) {
            activity.closeActivityLog();
          }
        }}
        activity={activity.activityQuery.data ?? null}
        isLoading={activity.activityQuery.isLoading}
        isFetching={activity.activityQuery.isFetching}
        error={activity.activityQuery.error instanceof AcademyApiError ? activity.activityQuery.error : null}
        currentPage={activity.activityPage}
        onPageChange={activity.setActivityPage}
      />
    </>
  );
}
