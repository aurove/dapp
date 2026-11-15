"use client";

import { MezoRequiredGate } from "@/components/app/mezo-required-gate";
import { AvailableEarningAssets } from "./available-earning-assets";
import { EarnPositions } from "./earn-positions";

export function EarnPage() {
  return (
    <MezoRequiredGate feature="Earn">
      <div className="space-y-6">
        <AvailableEarningAssets />
        <EarnPositions />
      </div>
    </MezoRequiredGate>
  );
}
