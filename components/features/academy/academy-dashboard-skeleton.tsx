import { BadgeCheck, Crown, Sparkles, Users } from "lucide-react";

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ui";

function StatCardSkeleton() {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-4 w-40 rounded-full" />
        </div>
        <Skeleton className="h-11 w-11 rounded-2xl" />
      </CardContent>
    </Card>
  );
}

export function AcademyDashboardSkeleton() {
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
              <Skeleton className="h-12 w-full max-w-[38rem] rounded-full" />
              <Skeleton className="h-4 w-full max-w-[34rem] rounded-full" />
              <Skeleton className="h-4 w-4/5 max-w-[28rem] rounded-full" />
            </div>
          </div>

          <Card className="w-full border-white/10 bg-black/20 backdrop-blur-md">
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-xl text-white">
                <Users className="h-5 w-5 text-[#e6d2ad]" />
                Referral network
              </CardTitle>
              <CardDescription>Share your Academy link and track who joins your network.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-10 w-full rounded-2xl" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-1 xl:grid-cols-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.33fr)_minmax(0,0.67fr)]">
        <Card className="border-white/10">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <BadgeCheck className="h-5 w-5 text-[#e6d2ad]" />
              Tasks carousel
            </CardTitle>
            <CardDescription>Swipe through the current Academy missions and guidance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-64 w-full rounded-3xl" />
            <div className="flex items-center justify-center gap-2">
              <Skeleton className="h-2.5 w-8 rounded-full" />
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Crown className="h-5 w-5 text-[#e6d2ad]" />
              Leaderboard
            </CardTitle>
            <CardDescription>Top Academy participants ranked by total points in the current season.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
