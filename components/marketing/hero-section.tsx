import Link from "next/link";
import { ArrowUpRight, Workflow } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, buttonVariants } from "@ui";

const highlights = [
  { label: "Earn", value: "Simple fungible products" },
  { label: "Markets", value: "Tradable position units" },
  { label: "Routing", value: "Rewards made legible" },
] as const;

const flow = [
  {
    title: "Complex Mezo Earn Position",
    body: "Start from veBTC / veMEZO locks, gauges, boosts, rewards, and incentive routing.",
  },
  {
    title: "Simple Fungible Earn Product",
    body: "Turn that position into transferable ERC1155 units users can understand and trade.",
  },
  {
    title: "Use, Trade, or Redeem",
    body: "Manage rewards, route incentives, trade exposure, and redeem through clear product flows.",
  },
] as const;

export function HeroSection() {
  return (
    <section className="pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="fade-up">
          <Badge className="mb-5">Mezo Earn, made liquid.</Badge>
          <h1 className="text-balance text-4xl font-semibold leading-tight text-[var(--foreground)] sm:text-5xl">
            Simple fungible Earn products for complex veBTC and veMEZO positions.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--muted)]">
            Aurove is the liquid ve-yield layer for Mezo Earn. It turns gauges, lock durations,
            boosts, rewards, and incentive routing into Earn products users can understand, trade,
            and use.
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
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(230,210,173,0.08),transparent_34%),linear-gradient(235deg,rgba(72,99,132,0.1),transparent_48%)]" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(230,210,173,0.36),transparent)]" />
          <CardHeader className="relative z-10">
            <Badge className="w-fit">Protocol Flow</Badge>
            <CardTitle className="text-2xl">
              From Mezo Earn complexity to usable fungible products
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
