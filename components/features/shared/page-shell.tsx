import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";

export function FeatureHeroSection({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(22,29,36,0.98),rgba(9,13,18,0.94))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] md:p-7">
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
    <div className="rounded-xl border border-white/12 bg-white/[0.035] p-4">
      <p className="text-xs font-medium uppercase text-white/45">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", subtle ? "text-white/70" : "text-white")}>
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-white/45">{detail}</p> : null}
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
          ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
          : "border-red-300/25 bg-red-500/10 text-red-100",
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
            <Badge className="border-white/15 bg-white/[0.04] text-white/70">{badge}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

