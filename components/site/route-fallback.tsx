"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Compass, Home, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, cn } from "@ui";

type RouteFallbackVariant = "error" | "not-found";

type RouteFallbackProps = {
  variant: RouteFallbackVariant;
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  note?: ReactNode;
};

const variantStyles: Record<RouteFallbackVariant, { badge: string; icon: ReactNode }> = {
  error: {
    badge: "border-rose-400/40 bg-rose-400/10 text-rose-800 dark:text-rose-100",
    icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
  },
  "not-found": {
    badge: "border-sky-400/40 bg-sky-400/10 text-sky-800 dark:text-sky-100",
    icon: <Compass className="h-5 w-5" aria-hidden="true" />,
  },
};

export function RouteFallback({
  variant,
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  onSecondaryAction,
  note,
}: RouteFallbackProps) {
  const accent = variantStyles[variant];

  return (
    <section className="relative isolate flex min-h-[calc(100vh-5rem)] items-center overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="app-shell-veil absolute inset-0" />
        <div className="app-shell-glow absolute inset-0" />
        <div className="app-shell-grid absolute inset-0 opacity-45 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.78),rgba(0,0,0,0.34)_70%,transparent_100%)]" />
        <div className="absolute left-1/2 top-0 h-44 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_68%)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <Card className="relative overflow-hidden border-[var(--line-strong)]">
          <div className="app-shell-glow pointer-events-none absolute inset-0 opacity-80" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_42%,transparent),transparent)]" />

          <CardHeader className="relative z-10 space-y-5 p-8 pb-4 sm:p-10 sm:pb-5">
            <Badge className={cn("w-fit", accent.badge)}>
              <span className="inline-flex items-center gap-2">
                {accent.icon}
                {eyebrow}
              </span>
            </Badge>

            <div className="space-y-3">
              <h1 className="text-balance text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
                {title}
              </h1>
              <CardDescription className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                {description}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="relative z-10 flex flex-col gap-5 p-8 pt-0 sm:flex-row sm:items-center sm:justify-between sm:p-10 sm:pt-0">
            <div className="max-w-xl space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent-soft)]">
                Aurove route recovery
              </p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {note ?? "Use the home page to re-enter the protocol surface and continue from there."}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:min-w-52 sm:items-end">
              <Button asChild size="lg" className="w-full gap-2 sm:w-auto">
                <Link href={primaryHref}>
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {primaryLabel}
                </Link>
              </Button>

              {secondaryLabel ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full gap-2 sm:w-auto"
                  onClick={onSecondaryAction}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {secondaryLabel}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
