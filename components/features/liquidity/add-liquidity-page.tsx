import Link from "next/link";
import { ArrowLeft, Droplets } from "lucide-react";
import { Badge } from "@ui";
import { FeatureHeroSection } from "@/components/features/shared/page-shell";
import type { AuroveLiquidityPair } from "@/lib/config/supported-liquidity-pools";
import { AddLiquidityCard } from "./add-liquidity-card";
import { IncentiviseGaugeButton } from "./incentivise-gauge-button";

export function AddLiquidityPage({ pair }: { pair: AuroveLiquidityPair }) {
  return (
    <div className="space-y-6">
      <Link
        href="/liquidity#available-pools"
        className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to liquidity pools
      </Link>
      <FeatureHeroSection>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-4">
            <Badge className="w-fit border-amber-300/25 bg-amber-300/10 text-amber-100">
              <Droplets className="mr-1 h-3.5 w-3.5" /> ADD LIQUIDITY
            </Badge>
            <div>
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {pair.title}
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-white/68">{pair.description}</p>
            </div>
          </div>
          <div className="w-full shrink-0 md:w-auto md:pt-0">
            <IncentiviseGaugeButton pair={pair} />
          </div>
        </div>
      </FeatureHeroSection>
      <div className="mx-auto max-w-4xl">
        <AddLiquidityCard initialPool={pair.key} />
      </div>
    </div>
  );
}
