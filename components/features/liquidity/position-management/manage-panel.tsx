"use client";

import { useMemo, useState } from "react";
import type { Abi, Address } from "viem";

import type { PortfolioSummary, WalletPortfolio } from "@/features/portfolio";
import { AdjustAmountPanel } from "./adjust-amount-panel";
import { AdjustRangePanel } from "./adjust-range-panel";
import { FarmPanel } from "./farm-panel";
import { ActionMessage, SegmentedControl, type ClGauge } from "./shared";
import type { Position, TokenMeta } from "../position-display";

export type ManageTab = "amount" | "range" | "farm";

function defaultManageTab(position: Position): ManageTab {
  if (position.liquidity > 0n && position.currentTick !== undefined) {
    const inRange = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
    if (!inRange) return "range";
  }
  if (position.isStaked) return "farm";
  return "amount";
}

function resolveGaugeForPosition(position: Position, gauges: readonly ClGauge[]): ClGauge | null {
  if (position.gaugeAddress) {
    return gauges.find((gauge) => gauge.address.toLowerCase() === position.gaugeAddress!.toLowerCase()) ?? null;
  }
  return gauges.find((gauge) => gauge.poolKey === position.poolKey) ?? null;
}

export function PositionManagePanel({
  position,
  token0,
  token1,
  displayInverted,
  managerAddress,
  managerAbi,
  routerAddress,
  routerAbi,
  ledgerAddress,
  deadline,
  portfolio,
  veCollections,
  clGauges,
  rewardTokenMeta,
}: {
  position: Position;
  token0?: TokenMeta;
  token1?: TokenMeta;
  displayInverted: boolean;
  managerAddress: Address;
  managerAbi: Abi;
  routerAddress: Address;
  routerAbi: Abi;
  ledgerAddress: Address;
  deadline: bigint | null;
  portfolio?: PortfolioSummary;
  veCollections: WalletPortfolio["veCollections"];
  clGauges: readonly ClGauge[];
  rewardTokenMeta?: TokenMeta;
}) {
  const gauge = resolveGaugeForPosition(position, clGauges);
  const [tab, setTab] = useState<ManageTab>(() => defaultManageTab(position));
  const [restakeAfter, setRestakeAfter] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shared = useMemo(
    () => ({
      position,
      token0,
      token1,
      displayInverted,
      managerAddress,
      managerAbi,
      routerAddress,
      routerAbi,
      ledgerAddress,
      deadline,
      portfolio,
      veCollections,
      gauge,
      rewardTokenMeta,
      restakeAfter,
      onRestakeAfterChange: setRestakeAfter,
      onComplete: (message: string) => () => {
        setError(null);
        setSuccess(message);
      },
      onError: (message: string) => {
        setSuccess(null);
        setError(message);
      },
    }),
    [
      deadline,
      displayInverted,
      gauge,
      ledgerAddress,
      managerAbi,
      managerAddress,
      portfolio,
      position,
      restakeAfter,
      rewardTokenMeta,
      routerAbi,
      routerAddress,
      token0,
      token1,
      veCollections,
    ],
  );

  return (
    <div className="space-y-4 pt-2">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        ariaLabel="Liquidity management actions"
        options={[
          { id: "amount", label: "Adjust Amount" },
          { id: "range", label: "Adjust Range" },
          { id: "farm", label: "Farm" },
        ]}
      />
      {tab === "amount" ? <AdjustAmountPanel {...shared} /> : null}
      {tab === "range" ? <AdjustRangePanel {...shared} /> : null}
      {tab === "farm" ? <FarmPanel {...shared} /> : null}
      <ActionMessage success={success} error={error} />
    </div>
  );
}
