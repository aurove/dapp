"use client";

import { useState, type ComponentType } from "react";
import {
  BadgeCheck,
  Copy,
  Crown,
  ChevronLeft,
  ChevronRight,
  Link2,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, cn } from "@ui";
import { formatPoints } from "@/lib/academy/utils";
import { normalizeWalletAddress, shortenWalletAddress } from "@/lib/auth/utils";
import type {
  AcademyCheckInState,
  AcademyLeaderboardEntry,
  AcademyLeaderboardPage,
  AcademySummary,
} from "@/lib/academy/types";
import { AcademyTasksCarousel } from "./academy-tasks-carousel";

type AcademyDashboardViewProps = {
  isAuthenticated: boolean;
  summary: AcademySummary | null;
  leaderboard: AcademyLeaderboardPage | null;
  currentUserLeaderboardEntry: AcademyLeaderboardEntry | null;
  checkIn: AcademyCheckInState | null;
  summaryError: string | null;
  leaderboardError: string | null;
  checkInError: string | null;
  isSummaryLoading: boolean;
  isLeaderboardLoading: boolean;
  isCheckInLoading: boolean;
  isCheckInSubmitting: boolean;
  leaderboardPage: number;
  onLeaderboardPageChange: (page: number) => void;
  onLeaderboardUserOpen: (walletAddress: string) => void;
  onLeaderboardUserPrefetch: (walletAddress: string) => void;
  onRetryAll: () => void;
  onCheckIn: () => void;
};

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
          {description ? <p className="text-xs leading-relaxed text-white/50">{description}</p> : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-[#e6d2ad]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function rankTone(rank: number) {
  if (rank === 1) {
    return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  }

  if (rank === 2) {
    return "border-slate-300/25 bg-slate-300/10 text-slate-100";
  }

  if (rank === 3) {
    return "border-orange-300/25 bg-orange-300/10 text-orange-100";
  }

  return "border-white/10 bg-white/5 text-white/80";
}

function ReferralMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function NoticeCard({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-rose-100">{title}</p>
          <p className="text-sm leading-6 text-rose-100/75">{description}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export function AcademyDashboardView({
  isAuthenticated,
  summary,
  leaderboard,
  currentUserLeaderboardEntry,
  checkIn,
  summaryError,
  leaderboardError,
  checkInError,
  isSummaryLoading,
  isLeaderboardLoading,
  isCheckInLoading,
  isCheckInSubmitting,
  leaderboardPage,
  onLeaderboardPageChange,
  onLeaderboardUserOpen,
  onLeaderboardUserPrefetch,
  onRetryAll,
  onCheckIn,
}: AcademyDashboardViewProps) {
  const [copied, setCopied] = useState(false);
  const season = summary?.season ?? leaderboard?.season ?? null;
  const referral = summary?.referral ?? null;
  const hasAnyError = Boolean(summaryError || leaderboardError || checkInError);
  const currentUserWallet = currentUserLeaderboardEntry
    ? normalizeWalletAddress(currentUserLeaderboardEntry.walletAddress)
    : null;
  const leaderboardEntries = currentUserWallet
    ? leaderboard?.items.filter(
        (entry) => normalizeWalletAddress(entry.walletAddress) !== currentUserWallet,
      ) ?? null
    : leaderboard?.items ?? null;
  const visibleLeaderboardEntries = leaderboardEntries ?? [];
  const showLeaderboardContent = visibleLeaderboardEntries.length > 0 || Boolean(currentUserLeaderboardEntry);
  const pointsValue = isSummaryLoading ? "..." : summary ? formatPoints(summary.totalPoints) : summaryError ? "Unavailable" : "0";
  const rankValue = isSummaryLoading
    ? "..."
    : summary
      ? summary.rank
        ? `#${summary.rank}`
        : "Unranked"
      : summaryError
        ? "Unavailable"
        : "Unranked";
  const seasonValue = isSummaryLoading ? "..." : season?.name ?? (summaryError ? "Unavailable" : "Between seasons");
  const seasonDescription = season?.description ?? (
    summaryError
      ? "We could not load the current season details just now."
      : "The next Academy campaign will appear here once it opens."
  );

  async function handleCopyReferralLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function LeaderboardRow({
    entry,
  }: {
    entry: AcademyLeaderboardEntry;
  }) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Open activity log for ${shortenWalletAddress(entry.walletAddress)}`}
        onClick={() => onLeaderboardUserOpen(entry.walletAddress)}
        onMouseEnter={() => onLeaderboardUserPrefetch(entry.walletAddress)}
        onFocus={() => onLeaderboardUserPrefetch(entry.walletAddress)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition",
          entry.isCurrentUser
            ? "border-amber-300/30 bg-amber-300/[0.08] ring-1 ring-amber-300/20"
            : "border-white/10 bg-white/[0.03]",
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold", rankTone(entry.rank))}>
            {entry.rank}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate font-medium text-white" title={entry.walletAddress}>
                {shortenWalletAddress(entry.walletAddress)}
              </p>
              {entry.isCurrentUser ? (
                <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">
                  You
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold text-white">{formatPoints(entry.totalPoints)}</p>
          <p className="text-xs text-white/45">points</p>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {hasAnyError ? (
        <NoticeCard
          title="Some Academy data needs another pass"
          description="We hit a temporary issue loading one or more Academy sections. You can retry without leaving the page."
          actionLabel="Retry all"
          onAction={onRetryAll}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.025)_40%,rgba(196,160,106,0.08)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196,160,106,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(72,99,132,0.25),transparent_30%)]" />
        <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-5">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Aurove Academy
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Earn points as you grow with Aurove.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
                Complete on-chain and off-chain actions, build your Academy score, and stay ready for future campaigns across the Aurove ecosystem.
              </p>
            </div>
          </div>

          <div className="flex">
            <Card className="w-full border-white/10 bg-black/20 backdrop-blur-md">
              <CardHeader className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl text-white">
                  <Link2 className="h-5 w-5 text-[#e6d2ad]" />
                  Referral network
                </CardTitle>
                <CardDescription>
                  Share your Academy link and track who joins your network.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAuthenticated ? (
                  isSummaryLoading ? (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <Skeleton className="h-3 w-24 rounded-full" />
                      <Skeleton className="h-10 w-full rounded-2xl" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-16 rounded-2xl" />
                        <Skeleton className="h-16 rounded-2xl" />
                      </div>
                    </div>
                  ) : summaryError && !referral?.referralLink ? (
                    <NoticeCard
                      title="Referral network unavailable"
                      description={summaryError}
                      actionLabel="Retry"
                      onAction={onRetryAll}
                    />
                  ) : referral?.referralLink ? (
                    <>
                      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                          Referral link
                        </p>
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 break-all text-sm text-white/80">
                            {referral.referralLink}
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="shrink-0 gap-1"
                            onClick={() => void handleCopyReferralLink(referral.referralLink ?? "")}
                          >
                            <Copy className="h-4 w-4" />
                            {copied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReferralMetric label="Direct referrals" value={`${referral.directCount}`} />
                        <ReferralMetric label="Grand referrals" value={`${referral.grandCount}`} />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-white/58">
                      Your referral link will appear here once your Academy profile is ready.
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-white/58">
                    Authenticate your wallet to unlock your referral link and track your Academy network.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-1 xl:grid-cols-3">
        <StatCard
          label="Current points"
          value={pointsValue}
          description={isAuthenticated ? "Points earned during the current Academy season." : "Visible after wallet authentication."}
          icon={Trophy}
        />
        <StatCard
          label="Current rank"
          value={rankValue}
          description="Earn points to enter the season leaderboard."
          icon={Crown}
        />
        <StatCard
          label="Season"
          value={seasonValue}
          description={seasonDescription}
          icon={BadgeCheck}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.33fr)_minmax(0,0.67fr)]">
        <AcademyTasksCarousel
          authenticated={isAuthenticated}
          checkIn={checkIn}
          checkInError={checkInError}
          isCheckInLoading={isCheckInLoading}
          isCheckInSubmitting={isCheckInSubmitting}
          onCheckIn={onCheckIn}
          onRetryCheckIn={onRetryAll}
        />

        <Card className="border-white/10">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Users className="h-5 w-5 text-[#e6d2ad]" />
              Leaderboard
            </CardTitle>
            <CardDescription>
              Top Academy participants ranked by total points in the current season.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLeaderboardLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : leaderboardError && !leaderboard?.items.length ? (
              <NoticeCard
                title="Leaderboard unavailable"
                description={leaderboardError}
                actionLabel="Retry"
                onAction={onRetryAll}
              />
            ) : showLeaderboardContent ? (
              <>
                {currentUserLeaderboardEntry ? (
                  <div className="space-y-2 rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-amber-100/70">Your position</p>
                      <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">Pinned</Badge>
                    </div>
                    <LeaderboardRow entry={currentUserLeaderboardEntry} />
                  </div>
                ) : null}
                <div className="space-y-2">
                  {visibleLeaderboardEntries.map((entry) => (
                    <LeaderboardRow key={entry.userId} entry={entry} />
                  ))}
                </div>

                {leaderboardError ? (
                  <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    We are showing the last loaded leaderboard snapshot while a refresh is attempted.
                  </p>
                ) : null}

                {leaderboard ? (
                  <div className="flex items-center justify-between gap-2 pt-1 text-sm">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onLeaderboardPageChange(Math.max(1, leaderboardPage - 1))}
                      disabled={leaderboardPage <= 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <p className="text-xs text-white/45">
                      Page {leaderboard.page} of {leaderboard.totalPages || 1}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onLeaderboardPageChange(Math.min(leaderboard.totalPages || 1, leaderboardPage + 1))
                      }
                      disabled={leaderboardPage >= (leaderboard.totalPages || 1)}
                      className="gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-sm text-white/55">
                {season
                  ? "The leaderboard will populate once the season starts."
                  : "The Academy leaderboard will appear once a season is live."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
