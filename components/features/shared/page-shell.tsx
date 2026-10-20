import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";

export function FeatureHeroSection({ children }: { children: ReactNode }) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl border border-foreground/12 p-5 shadow-[var(--shadow)] md:p-7">
      {children}
    </section>
  );
}

export function FeatureSplitGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">{children}</div>;
}

export function FeatureMetricCard({
  label,
  value,
  detail,
  subtle,
}: {
  label: string;
  value: string;
  detail?: string;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-foreground/12 bg-foreground/[0.035] p-4">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", subtle ? "text-foreground/70" : "text-foreground")}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

export function FeatureStatusPanel({
  tone,
  title,
  message,
}: {
  tone: "success" | "error";
  title: string;
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        tone === "success"
          ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
          : "border-red-300/25 bg-red-500/10 text-red-800 dark:text-red-100",
      )}
    >
      <div className="mt-0.5 h-4 w-4 rounded-full border border-current/40" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 opacity-80">{message}</p>
      </div>
    </div>
  );
}

export function FeaturePanelCard({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {badge ? (
            <Badge className="border-foreground/15 bg-foreground/[0.04] text-foreground/70">{badge}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

