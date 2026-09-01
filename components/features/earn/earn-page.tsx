"use client";

import { AvailableEarningAssets } from "./available-earning-assets";
import { EarnPositions } from "./earn-positions";

export function EarnPage() {
  return (
    <div className="space-y-6">
      <AvailableEarningAssets />
      <EarnPositions />
    </div>
  );
}
