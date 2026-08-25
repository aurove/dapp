"use client";

import { AvailableEarningAssets } from "./available-earning-assets";
import { EarnPositions } from "./earn-positions";
import { EarnRewards } from "./earn-rewards";

export function EarnPage() {
  return (
    <div className="space-y-6">
      <AvailableEarningAssets />
      <EarnPositions />
      <EarnRewards />
    </div>
  );
}
