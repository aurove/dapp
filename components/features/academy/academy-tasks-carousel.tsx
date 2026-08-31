"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Sparkles,
  Target,
} from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";

const AUTO_ADVANCE_INTERVAL_MS = 10_000;
const SWIPE_THRESHOLD_PX = 50;

function LiquidityProviderTaskSlide() {
  return (
    <Card className="h-full border-white/10 bg-white/[0.03]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
            <Droplets className="mr-1 h-3.5 w-3.5" />
            Liquidity provider task
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-white/70">90% allocation</Badge>
        </div>
        <CardTitle className="text-2xl text-white">Collect fees, earn points</CardTitle>
        <CardDescription>
          Collect actual fees from a position in either supported Aurove concentrated-liquidity
          pool.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm leading-6 text-white/65">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Earn <span className="font-semibold text-white">3.6 points per MUSD</span> of collected
          fee value.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          This equals 1.08% of the underlying qualifying swap volume and gives LPs nine points for
          every one swapper point.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Only fees actually collected from the canonical pools qualify; deposits, liquidity, and
          uncollected fee growth do not.
        </div>
        <Button asChild className="w-full gap-2 sm:w-auto">
          <Link href="/liquidity">
            Go to liquidity
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SwapperTaskSlide() {
  return (
    <Card className="h-full border-white/10 bg-white/[0.03]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className="border-sky-300/20 bg-sky-300/10 text-sky-100">
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
            Swapper task
          </Badge>
          <Badge className="border-white/10 bg-white/5 text-white/70">10% allocation</Badge>
        </div>
        <CardTitle className="text-2xl text-white">Swap through Aurove</CardTitle>
        <CardDescription>
          Make a swap routed through or involving either supported Aurove concentrated-liquidity
          pool.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm leading-6 text-white/65">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Earn points equal to{" "}
          <span className="font-semibold text-white">
            0.12% of the input token&apos;s MUSD value
          </span>
          .
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Input value is measured in MUSD at the time of the qualifying swap.
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Each economic swap earns once, including routed swaps that pass through multiple internal
          calls.
        </div>
        <Button asChild className="w-full gap-2 sm:w-auto">
          <Link href="/swap">
            Open swap
            <ArrowRight className="h-4 w-4" />
          </Link>
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
        <CardDescription>The carousel will expand as more Academy tasks go live.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm leading-6 text-white/65">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          Swap through Aurove or collect fees from a supported liquidity position to keep earning
          points.
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

export function AcademyTasksCarousel() {
  const dragStartXRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouchHeld, setIsTouchHeld] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const slides = [
    <SwapperTaskSlide key="swapper" />,
    <LiquidityProviderTaskSlide key="liquidity-provider" />,
    <MomentumSlide key="momentum" />,
  ];
  const totalSlides = slides.length;
  const autoAdvancePaused = isHovered || isTouchHeld || isFocusWithin || isDragging;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || autoAdvancePaused) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex((value) => (value + 1) % totalSlides);
    }, AUTO_ADVANCE_INTERVAL_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, autoAdvancePaused, prefersReducedMotion, timerEpoch, totalSlides]);

  const navigateTo = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(totalSlides - 1, index)));
    setTimerEpoch((value) => value + 1);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (dragPointerIdRef.current !== event.pointerId || dragStartXRef.current === null) return;

    const distance = event.clientX - dragStartXRef.current;
    if (!cancelled && Math.abs(distance) >= SWIPE_THRESHOLD_PX) {
      navigateTo(activeIndex + (distance < 0 ? 1 : -1));
    } else {
      setTimerEpoch((value) => value + 1);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartXRef.current = null;
    dragPointerIdRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
    setIsTouchHeld(false);
  };

  return (
    <Card
      className="min-w-0 border-white/10"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setIsHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setIsHovered(false);
      }}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusWithin(false);
        }
      }}
      aria-roledescription="carousel"
      aria-label="Academy tasks"
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <Target className="h-5 w-5 text-[#e6d2ad]" />
            Tasks carousel
          </CardTitle>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => navigateTo(activeIndex - 1)}
              disabled={activeIndex <= 0}
              aria-label="Previous task"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => navigateTo(activeIndex + 1)}
              disabled={activeIndex >= totalSlides - 1}
              aria-label="Next task"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>Swipe through the current Academy missions and guidance.</CardDescription>
      </CardHeader>

      <CardContent className="min-w-0 space-y-4">
        <div
          className="touch-pan-y overflow-hidden"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
            dragStartXRef.current = event.clientX;
            dragPointerIdRef.current = event.pointerId;
            setIsDragging(true);
            setIsTouchHeld(event.pointerType === "touch");
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragPointerIdRef.current !== event.pointerId || dragStartXRef.current === null)
              return;
            setDragOffset(event.clientX - dragStartXRef.current);
          }}
          onPointerUp={(event) => finishDrag(event)}
          onPointerCancel={(event) => finishDrag(event, true)}
        >
          <div
            className={cn(
              "flex ease-out",
              isDragging || prefersReducedMotion
                ? "transition-none"
                : "transition-transform duration-500",
            )}
            style={{ transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffset}px))` }}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                className="min-w-0 w-full shrink-0"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${totalSlides}`}
                aria-hidden={activeIndex !== index}
                inert={activeIndex !== index}
              >
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
              onClick={() => navigateTo(index)}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
