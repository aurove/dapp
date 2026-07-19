import { LiquidityPositions } from "./liquidity-positions";
import { AvailableLiquidityPools } from "./available-liquidity-pools";

export function LiquidityPage() {
  return (
    <div className="space-y-6">
      <AvailableLiquidityPools />
      <LiquidityPositions />
    </div>
  );
}
