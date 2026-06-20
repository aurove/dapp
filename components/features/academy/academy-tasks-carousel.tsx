"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCcw,
  Sparkles,
  Target,
} from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, cn } from "@ui";

import { ACADEMY_CHECK_IN_COOLDOWN_HOURS } from "@/lib/academy/constants";
import {
  computeChainCooldownProgress,
  computeChainSecondsRemaining,
} from "@/lib/academy/time";
import type { AcademyCheckInState } from "@/lib/academy/types";
import { formatPoints } from "@/lib/academy/utils";
import { useChainTime } from "@/lib/web3/use-chain-time";

type AcademyTasksCarouselProps = {
  authenticated: boolean;
  checkIn: AcademyCheckInState | null;
  checkInError: string | null;
  isCheckInLoading: boolean;
  isCheckInSubmitting: boolean;
  onCheckIn: () => void;
  onRetryCheckIn: () => void;
};

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const remainingSeconds = clamped % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  }

  return `${remainingSeconds}s`;
}

function formatTime(value: string | null): string | null {
  if (!value) return null;

  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CheckInTaskSlide({
  authenticated,
  checkIn,
  checkInError,
  isCheckInLoading,
  isCheckInSubmitting,
  onCheckIn,
  onRetryCheckIn,
}: AcademyTasksCarouselProps) {
  const { chainTimestampNumber } = useChainTime();
  const cooldownHours = checkIn?.cooldownHours ?? ACADEMY_CHECK_IN_COOLDOWN_HOURS;
  const isCoolingDownMode = authenticated && checkIn?.status === "cooldown";
  const nextEligibleAt = checkIn?.nextEligibleAt ?? null;
  const lastCheckInAt = checkIn?.lastCheckInAt ?? null;
  const chainTimestampSeconds = chainTimestampNumber ?? null;
  const cooldownSeconds = useMemo(() => {
    if (!isCoolingDownMode || !nextEligibleAt || chainTimestampSeconds === null) {
      return checkIn?.secondsRemaining ?? 0;
    }

    return computeChainSecondsRemaining(nextEligibleAt, chainTimestampSeconds);
  }, [checkIn?.secondsRemaining, chainTimestampSeconds, isCoolingDownMode, nextEligibleAt]);

  const isCoolingDown = isCoolingDownMode && cooldownSeconds > 0;
  const ready = !isCoolingDown;
  const pointsLabel = formatPoints(checkIn?.pointsAwarded ?? 0);
  const cooldownElapsed = useMemo(() => {
    if (!lastCheckInAt || !nextEligibleAt || chainTimestampSeconds === null) {
      return 0;
    }

    return computeChainCooldownProgress({
      lastCheckInAt,
      nextEligibleAt,
      chainTimestampSeconds,
    });
  }, [chainTimestampSeconds, lastCheckInAt, nextEligibleAt]);

  if (isCheckInLoading) {
    return (
      <Card className="h-full border-white/10 bg-white/[0.03]">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
              <Target className="mr-1 h-3.5 w-3.5" />
              Daily mission
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {cooldownHours}h cooldown
            </Badge>
          </div>
          <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
          <CardDescription>
            Keep your Academy momentum going with a repeatable check-in every {cooldownHours} hours.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 text-white">
              <BadgeCheck className="h-4 w-4 text-[#e6d2ad]" />
              <p className="font-medium">Loading check-in status</p>
            </div>
            <p className="text-sm leading-6 text-white/58">
              We are loading your current cooldown and reward details.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!authenticated) {
    return (
      <Card className="h-full border-white/10 bg-white/[0.03]">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
              <Target className="mr-1 h-3.5 w-3.5" />
              Daily mission
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {cooldownHours}h cooldown
            </Badge>
          </div>
          <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
          <CardDescription>
            Keep your Academy momentum going with a repeatable check-in every {cooldownHours} hours.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 text-white">
              <BadgeCheck className="h-4 w-4 text-[#e6d2ad]" />
              <p className="font-medium">Authenticate to unlock check-in</p>
            </div>
            <p className="text-sm leading-6 text-white/58">
              Connect your wallet to see your current check-in cooldown and start earning Academy points.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!checkIn) {
    return (
      <Card className="h-full border-white/10 bg-white/[0.03]">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
              <Target className="mr-1 h-3.5 w-3.5" />
              Daily mission
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/70">
              {cooldownHours}h cooldown
            </Badge>
          </div>
          <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
          <CardDescription>
            Keep your Academy momentum going with a repeatable check-in every {cooldownHours} hours.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {checkInError ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4">
              <p className="font-medium text-rose-100">Unable to load check-in status</p>
              <p className="mt-1 text-sm leading-6 text-rose-100/75">{checkInError}</p>
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={onRetryCheckIn}>
                Retry check-in
              </Button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5">
              <div className="flex items-center gap-2 text-white">
                <BadgeCheck className="h-4 w-4 text-[#e6d2ad]" />
                <p className="font-medium">Preparing check-in details</p>
              </div>
              <p className="text-sm leading-6 text-white/58">
                We are loading your current cooldown and reward details.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-white/10 bg-white/[0.03]">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
            <Target className="mr-1 h-3.5 w-3.5" />
            Daily mission
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            {cooldownHours}h cooldown
          </Badge>
        </div>
        <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
        <CardDescription>
          Keep your Academy momentum going with a repeatable check-in every {cooldownHours} hours.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Reward</p>
              <p className="text-2xl font-semibold text-white">{pointsLabel} points</p>
              <p className="text-sm text-white/55">Per successful check-in.</p>
            </div>
            <Badge
              className={cn(
                "border",
                ready
                  ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                  : "border-amber-300/20 bg-amber-300/10 text-amber-100",
              )}
            >
              {ready ? "Ready now" : `Ready in ${formatCountdown(cooldownSeconds)}`}
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>Cooldown progress</span>
                <span>{ready ? "100%" : `${cooldownElapsed}%`}</span>
              </div>
              <Progress value={ready ? 100 : cooldownElapsed} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Last check-in</p>
                <p className="mt-1 text-sm text-white/80">
                  {formatTime(checkIn.lastCheckInAt) ?? "No prior check-in yet."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Next eligible</p>
                <p className="mt-1 text-sm text-white/80">
                  {formatTime(checkIn.nextEligibleAt) ?? "Available immediately."}
                </p>
              </div>
            </div>

            {checkInError ? (
              <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">
                We are showing the current check-in snapshot while a refresh is attempted.
              </p>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          className="w-full gap-2"
          onClick={onCheckIn}
          disabled={!ready || isCheckInSubmitting}
        >
          {isCheckInSubmitting ? (
            <>
              <RefreshCcw className="h-4 w-4 animate-spin" />
              Checking in...
            </>
          ) : ready ? (
            <>
              <BadgeCheck className="h-4 w-4" />
              Check in now
            </>
          ) : (
            <>
              <Clock3 className="h-4 w-4" />
              Cooldown active
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function MomentumSlide() {
  return (
    <Card className="h-full border-white/10 bg-white/[0.03]">
      <CardHeader className="space-y-2">
        <Badge className="border-white/10 bg-white/5 text-white/75">
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          Academy workflow
        </Badge>
        <CardTitle className="text-2xl text-white">Keep the season moving</CardTitle>
        <CardDescription>
          The carousel will expand as more Academy tasks go live.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm leading-6 text-white/65">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Check in every {ACADEMY_CHECK_IN_COOLDOWN_HOURS} hours to keep collecting points without missing a beat.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Your activity updates the leaderboard, feed, and referral rewards in real time.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          More tasks will slot into this carousel as the Academy program expands.
        </div>
      </CardContent>
    </Card>
  );
}

export function AcademyTasksCarousel(props: AcademyTasksCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = [
    <CheckInTaskSlide key="check-in" {...props} />,
    <MomentumSlide key="momentum" />,
  ];

  const totalSlides = slides.length;

  return (
    <Card className="border-white/10">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Target className="h-5 w-5 text-[#e6d2ad]" />
            Tasks carousel
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
              disabled={activeIndex <= 0}
              aria-label="Previous task"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => setActiveIndex((value) => Math.min(totalSlides - 1, value + 1))}
              disabled={activeIndex >= totalSlides - 1}
              aria-label="Next task"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>Swipe through the current Academy missions and guidance.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {slides.map((slide, index) => (
              <div key={index} className="w-full shrink-0">
                {slide}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              className={cn(
                "h-2.5 rounded-full transition-all",
                activeIndex === index ? "w-8 bg-amber-300" : "w-2.5 bg-white/20",
              )}
              onClick={() => setActiveIndex(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
