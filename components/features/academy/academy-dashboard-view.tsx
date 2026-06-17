"use client";

import { type ComponentType } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Crown, Sparkles, Trophy, Users } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, cn } from "@ui";
import { formatPoints } from "@/lib/academy/utils";
import type { AcademyLeaderboardPage, AcademySummary } from "@/lib/academy/types";

type AcademyDashboardViewProps = {
  summary: AcademySummary | null;
  leaderboard: AcademyLeaderboardPage | null;
  isSummaryLoading: boolean;
  isLeaderboardLoading: boolean;
  leaderboardPage: number;
  onLeaderboardPageChange: (page: number) => void;
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

export function AcademyDashboardView({
  summary,
  leaderboard,
  isSummaryLoading,
  isLeaderboardLoading,
  leaderboardPage,
  onLeaderboardPageChange,
}: AcademyDashboardViewProps) {
  const season = summary?.season ?? leaderboard?.season ?? null;
  const authenticated = Boolean(summary?.authenticated);

  return (
    <div className="space-y-6 pb-8">
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
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-1 xl:grid-cols-3">
        <StatCard
          label="Current points"
          value={isSummaryLoading ? "..." : formatPoints(summary?.totalPoints ?? 0)}
          description={authenticated ? "Points earned during the current Academy season." : "Visible after wallet authentication."}
          icon={Trophy}
        />
        <StatCard
          label="Current rank"
          value={isSummaryLoading ? "..." : summary?.rank ? `#${summary.rank}` : "Unranked"}
          description="Earn points to enter the season leaderboard."
          icon={Crown}
        />
        <StatCard
          label="Season"
          value={isSummaryLoading ? "..." : season?.name ?? "Between seasons"}
          description={season?.description ?? "The next Academy campaign will appear here once it opens."}
          icon={BadgeCheck}
        />
      </div>

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
          ) : leaderboard?.items.length ? (
            <>
              <div className="space-y-2">
                {leaderboard.items.map((entry) => (
                  <div
                    key={entry.userId}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-2xl border p-3 transition",
                      entry.isCurrentUser
                        ? "border-amber-300/30 bg-amber-300/[0.08] ring-1 ring-amber-300/20"
                        : "border-white/10 bg-white/[0.03]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("flex size-10 items-center justify-center rounded-2xl border text-sm font-semibold", rankTone(entry.rank))}>
                        {entry.rank}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{entry.walletAddress}</p>
                          {entry.isCurrentUser ? (
                            <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">
                              You
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-white/45">
                          {entry.walletAddressNormalized}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-white">{formatPoints(entry.totalPoints)}</p>
                      <p className="text-xs text-white/45">points</p>
                    </div>
                  </div>
                ))}
              </div>

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
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-sm text-white/55">
              The leaderboard will populate once the season starts.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
