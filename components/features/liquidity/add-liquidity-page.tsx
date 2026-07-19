import Link from "next/link";
import { ArrowLeft, Droplets } from "lucide-react";
import { Badge } from "@ui";
import { FeatureHeroSection } from "@/components/features/shared/page-shell";
import { AddLiquidityCard } from "./add-liquidity-card";
import type { SlipstreamPoolKey } from "./slipstream-adapter";

const COPY: Record<SlipstreamPoolKey, { title: string; description: string }> = {
  BTC: { title: "Add liquidity to MUSD / avBTCm", description: "Choose your funding assets and configure the price range for this Aurove BTC pool." },
  MEZO: { title: "Add liquidity to avBTCm / avMEZOm", description: "Choose your funding assets and configure the price range for this Aurove BTC and MEZO pool." },
};

export function AddLiquidityPage({ poolKey }: { poolKey: SlipstreamPoolKey }) {
  const copy = COPY[poolKey];
  return <div className="space-y-6">
    <Link href="/liquidity#available-pools" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to liquidity pools</Link>
    <FeatureHeroSection><div className="space-y-4"><Badge className="w-fit border-amber-300/25 bg-amber-300/10 text-amber-100"><Droplets className="mr-1 h-3.5 w-3.5" /> ADD LIQUIDITY</Badge><div><h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">{copy.title}</h1><p className="mt-2 max-w-2xl text-base leading-7 text-white/68">{copy.description}</p></div></div></FeatureHeroSection>
    <div className="mx-auto max-w-4xl"><AddLiquidityCard initialPool={poolKey} /></div>
  </div>;
}
