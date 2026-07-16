import { Sparkles } from "lucide-react";
import { Badge } from "@ui";
import { FeatureHeroSection } from "@/components/features/shared/page-shell";
import { AddLiquidityCard } from "./add-liquidity-card";

export function LiquidityPage() {
  return (
    <div className="space-y-6">
      <FeatureHeroSection>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">
                <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                LIQUIDITY
              </Badge>
              <Badge className="border-sky-300/25 bg-sky-300/10 text-sky-100">
                EARN TWO WAYS
              </Badge>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Supply liquidity with your locked BTC and locked MEZO.
              </h1>
              <p className="text-base leading-7 text-white/68 md:text-lg">
                Add another income stream to your Mezo Earn positions. Keep earning in Mezo Earn
                while collecting swap fees whenever trades move through your active price range.
              </p>
            </div>
          </div>
        </div>
      </FeatureHeroSection>

      <AddLiquidityCard />
    </div>
  );
}
