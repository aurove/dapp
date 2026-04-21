import Link from "next/link";
import { ArrowRightLeft, Coins, Layers3, TrendingUp } from "lucide-react";
import { Badge } from "@fractals/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import { buttonVariants } from "@fractals/ui/components/ui/button";

const stats = [
  { label: "Active Fraction Books", value: "12", change: "+3 this epoch", icon: Layers3 },
  { label: "24h Matched Volume", value: "$3.8M", change: "+14.2%", icon: ArrowRightLeft },
  { label: "Open Settlement Value", value: "$7.4M", change: "2 windows", icon: Coins },
  { label: "Yield Routes Live", value: "6", change: "Optimised", icon: TrendingUp },
] as const;

export function AppEntry() {
  return (
    <section className="space-y-6">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(216,181,106,0.28),rgba(216,181,106,0))]" />
        <CardHeader className="relative z-10">
          <Badge className="w-fit">Overview</Badge>
          <CardTitle className="text-2xl sm:text-3xl">
            Dashboard for fractional liquidity, settlement windows, and yield routing.
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            Monitor the full ve position lifecycle: fraction issuance, secondary market activity,
            settlement readiness, and rollover routing in one operating surface.
          </p>
        </CardHeader>
        <CardContent className="relative z-10 pt-0">
          <div className="flex flex-wrap gap-3">
            <Link href="/app/trade" className={buttonVariants({ size: "sm" })}>
              Open Trade
            </Link>
            <Link href="/app/earn" className={buttonVariants({ size: "sm", variant: "secondary" })}>
              Open Earn
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  {stat.label}
                </p>
                <stat.icon className="h-4 w-4 text-[var(--accent-soft)]" />
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Settlement Queue</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-3 text-sm text-[var(--muted)]">
              <li className="flex items-center justify-between">
                <span>Epoch 142</span>
                <span>Opens in 08h 12m</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Epoch 143</span>
                <span>Opens in 2d 04h</span>
              </li>
              <li className="flex items-center justify-between">
                <span>Epoch 144</span>
                <span>Opens in 5d 01h</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Route Health</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm leading-7 text-[var(--muted)]">
            Current route optimiser indicates strongest weighted carry on 6-9 month duration bands
            with lower implied rollover friction versus manual position management.
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
