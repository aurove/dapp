import Link from "next/link";
import { ArrowUpRight, Workflow } from "lucide-react";
import { Badge } from "@fractals/ui/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { buttonVariants } from "@fractals/ui/ui/button";

const highlights = [
  { label: "Settlement", value: "Window-driven lifecycle" },
  { label: "Fractions", value: "Transferable position units" },
  { label: "Yield", value: "Managed routing overlays" },
] as const;

const flow = [
  {
    title: "Locked Base Position",
    body: "Start from long-duration veBTC / veMEZO exposure and preserve lock intent.",
  },
  {
    title: "Fractional Claims",
    body: "Create transferable claims without manually unwinding the underlying lock.",
  },
  {
    title: "Settlement + Rollover",
    body: "Resolve windows with clearer redemption and route-management behavior.",
  },
] as const;

export function HeroSection() {
  return (
    <section className="pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="fade-up">
          <Badge className="mb-5">Structured Liquidity Layer</Badge>
          <h1 className="text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
            Fractional liquidity for locked veBTC and veMEZO positions.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--muted)]">
            Fractals transforms time-locked Mezo Earn positions into transferable claims, so you can
            keep lock conviction while improving exits, ownership flexibility, and yield outcomes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Enter App
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2" })}
            >
              <Workflow className="h-4 w-4" aria-hidden="true" />
              How It Works
            </a>
          </div>

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            {highlights.map((highlight) => (
              <Card key={highlight.label} className="rounded-2xl px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3f5368]">
                  {highlight.label}
                </p>
                <p className="mt-2 text-[1.08rem] font-semibold tracking-tight">
                  {highlight.value}
                </p>
              </Card>
            ))}
          </div>
        </div>

        <Card className="fade-up relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,181,106,0.28),rgba(216,181,106,0))]" />
          <CardHeader className="relative z-10">
            <Badge className="w-fit">Protocol Flow</Badge>
            <CardTitle className="text-2xl">
              From locked exposure to tradable fractional liquidity
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 space-y-3">
            {flow.map((step, index) => (
              <div
                key={step.title}
                className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.02)] px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[var(--accent-soft)]">
                  Step {index + 1}
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
