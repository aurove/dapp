"use client";

import { useEffect, useMemo, useState } from "react";
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

import type { AcademyCheckInState } from "@/lib/academy/types";
import { formatPoints } from "@/lib/academy/utils";

type AcademyTasksCarouselProps = {
  authenticated: boolean;
  checkIn: AcademyCheckInState | null;
  isCheckInLoading: boolean;
  isCheckInSubmitting: boolean;
  onCheckIn: () => void;
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

function useLiveNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [enabled]);

  return now;
}

function CheckInTaskSlide({
  authenticated,
  checkIn,
  isCheckInLoading,
  isCheckInSubmitting,
  onCheckIn,
}: AcademyTasksCarouselProps) {
  if (!authenticated || !checkIn) {
    return (
      <Card className="h-full border-white/10 bg-white/[0.03]">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
              <Target className="mr-1 h-3.5 w-3.5" />
              Daily mission
            </Badge>
            <Badge className="border-white/10 bg-white/5 text-white/70">8h cooldown</Badge>
          </div>
          <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
          <CardDescription>
            Keep your Academy momentum going with a repeatable check-in every eight hours.
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

  const now = useLiveNow(checkIn.status === "cooldown");
  const nextEligibleAt = checkIn.nextEligibleAt;
  const lastCheckInAt = checkIn.lastCheckInAt;
  const isCoolingDown = checkIn.status === "cooldown" && nextEligibleAt ? Date.parse(nextEligibleAt) > now : false;
  const cooldownSeconds = useMemo(() => {
    if (!nextEligibleAt) {
      return 0;
    }

    return Math.max(0, Math.ceil((Date.parse(nextEligibleAt) - now) / 1000));
  }, [nextEligibleAt, now]);

  const ready = !isCoolingDown;
  const pointsLabel = formatPoints(checkIn.pointsAwarded);
  const cooldownElapsed = useMemo(() => {
    if (!lastCheckInAt || !nextEligibleAt) {
      return 0;
    }

    const totalMs = Date.parse(nextEligibleAt) - Date.parse(lastCheckInAt);
    if (totalMs <= 0) {
      return 0;
    }

    const remainingMs = Math.max(0, Date.parse(nextEligibleAt) - now);
    return Math.min(100, Math.max(0, Math.round(((totalMs - remainingMs) / totalMs) * 100)));
  }, [lastCheckInAt, nextEligibleAt, now]);

  return (
    <Card className="h-full border-white/10 bg-white/[0.03]">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
            <Target className="mr-1 h-3.5 w-3.5" />
            Daily mission
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-white/70">
            {checkIn?.cooldownHours ?? 8}h cooldown
          </Badge>
        </div>
        <CardTitle className="text-2xl text-white">Check in and stack points</CardTitle>
        <CardDescription>
          Keep your Academy momentum going with a repeatable check-in every eight hours.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isCheckInLoading ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="h-24 w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
        ) : authenticated && checkIn ? (
          <>
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
          </>
        ) : null}
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
          Check in every 8 hours to keep collecting points without missing a beat.
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

  const slides = useMemo(
    () => [
      <CheckInTaskSlide key="check-in" {...props} />,
      <MomentumSlide key="momentum" />,
    ],
    [props],
  );

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
