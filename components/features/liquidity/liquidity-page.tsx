"use client";

import { MezoRequiredGate } from "@/components/app/mezo-required-gate";
import { LiquidityPositions } from "./liquidity-positions";
import { AvailableLiquidityPools } from "./available-liquidity-pools";

export function LiquidityPage() {
  return (
    <MezoRequiredGate feature="Liquidity">
      <div className="space-y-6">
        <AvailableLiquidityPools />
        <LiquidityPositions />
      </div>
    </MezoRequiredGate>
  );
}
