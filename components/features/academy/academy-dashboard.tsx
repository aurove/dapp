"use client";

import { AcademyActivityDialog } from "./academy-activity-dialog";
import { AcademyDashboardView } from "./academy-dashboard-view";
import { useAcademyActivity } from "./use-academy-activity";
import { useAcademyDashboard } from "./use-academy-dashboard";
import { useAcademyReferral } from "./use-academy-referral";
import { AcademyApiError } from "@/lib/academy/client";

export function AcademyDashboard() {
  const {
    summaryQuery,
    leaderboardQuery,
    checkInQuery,
    checkInMutation,
    leaderboardPage,
    setLeaderboardPage,
  } = useAcademyDashboard();
  useAcademyReferral();
  const seasonId = summaryQuery.data?.season?.id ?? leaderboardQuery.data?.season?.id ?? null;
  const activity = useAcademyActivity(seasonId);

  return (
    <>
      <AcademyDashboardView
        summary={summaryQuery.data ?? null}
        leaderboard={leaderboardQuery.data ?? null}
        checkIn={checkInQuery.data ?? null}
        isSummaryLoading={summaryQuery.isLoading}
        isLeaderboardLoading={leaderboardQuery.isLoading}
        isCheckInLoading={checkInQuery.isLoading}
        isCheckInSubmitting={checkInMutation.isPending}
        leaderboardPage={leaderboardPage}
        onLeaderboardPageChange={setLeaderboardPage}
        onLeaderboardUserOpen={activity.openActivityLog}
        onLeaderboardUserPrefetch={activity.prefetchActivityLog}
        onCheckIn={() => {
          if (!checkInMutation.isPending) {
            checkInMutation.mutate();
          }
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
