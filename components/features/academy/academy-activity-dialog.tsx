"use client";

import { type ReactNode, useMemo } from "react";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Skeleton, cn } from "@ui";

import { formatPoints } from "@/lib/academy/utils";
import { shortenWalletAddress } from "@/lib/auth/utils";
import { AcademyApiError } from "@/lib/academy/client";
import type { AcademyActivityEntry, AcademyActivityPage } from "@/lib/academy/types";

type AcademyActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: AcademyActivityPage | null;
  isLoading: boolean;
  isFetching: boolean;
  error: AcademyApiError | null;
  currentPage: number;
  onPageChange: (page: number) => void;
};

function formatActivityDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatActivityTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLabel(input: string): string {
  return input
    .replaceAll(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getAwardLabel(sourceDetails: Record<string, unknown>): string | null {
  const awardType = typeof sourceDetails.awardType === "string" ? sourceDetails.awardType : null;
  if (!awardType) {
    return null;
  }

  if (awardType === "task_award_referral_direct") {
    return "Direct referral reward";
  }

  if (awardType === "task_award_referral_grand") {
    return "Grand referral reward";
  }

  if (awardType === "task_award_user") {
    return "Task reward";
  }

  return toLabel(awardType);
}

function groupByDate(items: AcademyActivityEntry[]): Array<{ dateKey: string; label: string; entries: AcademyActivityEntry[] }> {
  const groups = new Map<string, AcademyActivityEntry[]>();

  for (const entry of items) {
    const key = entry.occurredAt.slice(0, 10);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([dateKey, entries]) => ({
    dateKey,
    label: formatActivityDate(entries[0]?.occurredAt ?? dateKey),
    entries,
  }));
}

function ActivityLoadingState() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-sm text-white/58">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-1 leading-7 text-white/55">{description}</p>
    </div>
  );
}

function ActivityEntryCard({ entry }: { entry: AcademyActivityEntry }) {
  const positive = entry.pointsDelta >= 0;
  const pointsLabel = `${positive ? "+" : "-"}${formatPoints(Math.abs(entry.pointsDelta))}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{entry.activityName}</p>
            <Badge className="border-white/10 bg-white/5 text-white/75">{toLabel(entry.sourceKind)}</Badge>
            {getAwardLabel(entry.sourceDetails) ? (
              <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
                {getAwardLabel(entry.sourceDetails)}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-white/45">
            {formatActivityDate(entry.occurredAt)} at {formatActivityTime(entry.occurredAt)}
          </p>
        </div>
        <p className={cn("text-sm font-semibold", positive ? "text-emerald-300" : "text-rose-300")}>
          {pointsLabel} points
        </p>
      </div>

    </div>
  );
}

export function AcademyActivityDialog({
  open,
  onOpenChange,
  activity,
  isLoading,
  isFetching,
  error,
  currentPage,
  onPageChange,
}: AcademyActivityDialogProps) {
  const page = activity?.page ?? currentPage;
  const totalPages = activity?.totalPages ?? 0;
  const user = activity?.user ?? null;

  const errorState = useMemo(() => {
    if (!error) return null;

    if (error.code === "ACADEMY_ACTIVITY_USER_NOT_FOUND") {
      return {
        title: "User not found",
        description:
          "We couldn’t find that Academy participant. The activity log URL may be outdated or incorrect.",
      };
    }

    return {
      title: "Unable to load activity",
      description: error.message || "Please try again in a moment.",
    };
  }, [error]);

  const groups = useMemo(() => {
    if (!activity?.items.length) {
      return [];
    }

    return groupByDate(activity.items);
  }, [activity?.items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-white/10 px-4 py-5 sm:px-6">
            <DialogTitle className="text-2xl">Academy activity</DialogTitle>
            <DialogDescription>
              {user ? `Activity history for ${shortenWalletAddress(user.walletAddress)}` : "Activity history for the selected Academy participant."}
            </DialogDescription>

            {user ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="border-white/10 bg-white/5 text-white/75">
                  {formatPoints(user.totalPoints)} points
                </Badge>
                <Badge className="border-white/10 bg-white/5 text-white/75">
                  {user.rank ? `Rank #${user.rank}` : "Unranked"}
                </Badge>
                {user.isCurrentUser ? (
                  <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">You</Badge>
                ) : null}
              </div>
            ) : null}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {isLoading ? <ActivityLoadingState /> : null}

            {!isLoading && errorState ? (
              <EmptyState title={errorState.title} description={errorState.description} />
            ) : null}

            {!isLoading && !errorState && activity && activity.items.length === 0 ? (
              <EmptyState
                title="No Academy activity yet."
                description={
                  <>
                    This user&apos;s completed missions and point awards will appear here once activity is recorded.
                  </>
                }
              />
            ) : null}

            {!isLoading && !errorState && groups.length > 0 ? (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.dateKey} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-white/10" />
                      <p className="text-xs uppercase tracking-[0.24em] text-white/40">{group.label}</p>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <div className="space-y-3">
                      {group.entries.map((entry) => (
                        <ActivityEntryCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-4 text-sm sm:px-6">
            <p className="text-xs text-white/45">
              {isFetching && !isLoading ? "Refreshing activity log..." : `Page ${page} of ${totalPages || 1}`}
            </p>

            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1 || isFetching}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || isFetching}
                >
                  Next
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled>
                  Prev
                </Button>
                <Button variant="secondary" size="sm" disabled>
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
