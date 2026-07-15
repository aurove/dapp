"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeftRight,
  BadgeInfo,
  ChevronDown,
  Droplets,
  Gauge,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Route,
  Sparkles,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, cn } from "@ui";
import {
  getAssetKindLabel,
  getMockRouteEfficiency,
  getMockSwapRoute,
  mockSwapAssets,
  type MockSwapAsset,
} from "./mock-data";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 2 : 6,
  }).format(value);
}

function assetTone(asset: MockSwapAsset): string {
  if (asset.kind === "venft") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (asset.kind === "erc1155") return "border-sky-300/25 bg-sky-300/10 text-sky-100";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
}

function normalizeAmount(value: string): string {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");
  if (fractions.length === 0) return whole;
  return `${whole}.${fractions.join("").slice(0, 8)}`;
}

type AssetSelectProps = {
  label: string;
  selected: MockSwapAsset;
  blockedAssetId?: string;
  onSelect: (asset: MockSwapAsset) => void;
};

function AssetSelect({ label, selected, blockedAssetId, onSelect }: AssetSelectProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">{label}</p>
        <p className="text-xs text-white/45">Balance: {selected.balanceLabel}</p>
      </div>
      <div className="rounded-xl border border-white/12 bg-white/[0.025] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-white">{selected.symbol}</p>
              <Badge className={cn("normal-case tracking-normal", assetTone(selected))}>
                {selected.descriptor}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-white/55">{selected.name}</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-white/45">
            Select
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {mockSwapAssets.map((asset) => {
            const isSelected = asset.id === selected.id;
            const isBlocked = asset.id === blockedAssetId;

            return (
              <button
                key={asset.id}
                type="button"
                disabled={isBlocked}
                onClick={() => onSelect(asset)}
                className={cn(
                  "min-h-16 rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1117]",
                  isSelected
                    ? "border-[#b58f5f]/65 bg-[#b58f5f]/16 text-white"
                    : "border-white/10 bg-white/[0.02] text-white/72 hover:border-white/20 hover:bg-white/[0.055]",
                  isBlocked && "cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-white/[0.02]",
                )}
              >
                <span className="block text-sm font-semibold">{asset.symbol}</span>
                <span className="mt-1 block text-xs text-white/45">{asset.descriptor}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-white/52">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-[0.15em]">{label}</p>
      </div>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/45">{detail}</p>
    </div>
  );
}

export function SwapPage() {
  const [fromAsset, setFromAsset] = useState(mockSwapAssets[0]);
  const [toAsset, setToAsset] = useState(mockSwapAssets[5]);
  const [amount, setAmount] = useState("1");

  const parsedAmount = Number(amount);
  const route = useMemo(() => getMockSwapRoute(fromAsset, toAsset), [fromAsset, toAsset]);
  const routeEfficiency = useMemo(() => getMockRouteEfficiency(route), [route]);
  const estimatedOutput = Number.isFinite(parsedAmount)
    ? (parsedAmount * fromAsset.priceUsd * routeEfficiency) / toAsset.priceUsd
    : 0;
  const priceImpact = Math.max(0.08, (1 - routeEfficiency) * 100);
  const routeLiquidity = Math.min(fromAsset.liquidityUsd, toAsset.liquidityUsd) * routeEfficiency;
  const pairPrice = fromAsset.priceUsd / toAsset.priceUsd;

  function switchAssets() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
  }

  function selectFrom(asset: MockSwapAsset) {
    if (asset.id === toAsset.id) {
      setToAsset(fromAsset);
    }
    setFromAsset(asset);
  }

  function selectTo(asset: MockSwapAsset) {
    if (asset.id === fromAsset.id) {
      setFromAsset(toAsset);
    }
    setToAsset(asset);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(22,29,36,0.98),rgba(9,13,18,0.94))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] md:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-300/25 bg-amber-300/10 text-amber-100">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Liquid ve-yield
              </Badge>
              <Badge className="border-sky-300/25 bg-sky-300/10 text-sky-100">
                Mock routing
              </Badge>
            </div>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Swap your Mezo Earn positions for instant liquidity.
              </h1>
              <p className="text-base leading-7 text-white/68 md:text-lg">
                The liquid ve-yield layer for Mezo Earn. Keep earning from your Mezo Earn
                exposure, with the flexibility to swap when you need liquidity.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatTile
              icon={Layers3}
              label="Asset coverage"
              value="veNFT, ERC1155, ERC20"
              detail="Preview routes across positions, fractions, and wrapper tokens."
            />
            <StatTile
              icon={Droplets}
              label="Mock liquidity"
              value={formatUsd(routeLiquidity)}
              detail="Routing is modeled locally while integrations are prepared."
            />
            <StatTile
              icon={LockKeyhole}
              label="Execution"
              value="No live writes"
              detail="No live swap transaction is executed yet."
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden border-white/12">
          <CardHeader className="border-b border-white/10 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ArrowLeftRight className="h-5 w-5 text-[var(--accent-soft)]" aria-hidden="true" />
                  Swap
                </CardTitle>
                <CardDescription>
                  Preview mocked routes across veNFT positions, ERC1155 fractions, and ERC20 tokens.
                </CardDescription>
              </div>
              <Badge className="border-white/15 bg-white/[0.04] text-white/70 normal-case tracking-normal">
                Swap coming soon
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="swap-amount" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                  You pay
                </label>
                <p className="text-xs text-white/45">{fromAsset.routeHint}</p>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.025] p-3">
                <Input
                  id="swap-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(normalizeAmount(event.target.value))}
                  placeholder="0.0"
                  className="h-14 border-0 bg-transparent px-0 text-3xl font-semibold text-white shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            <AssetSelect
              label="From"
              selected={fromAsset}
              blockedAssetId={toAsset.id}
              onSelect={selectFrom}
            />

            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={switchAssets}
                aria-label="Switch swap direction"
                className="rounded-full border-white/15 bg-[#101821] shadow-[0_12px_30px_rgba(0,0,0,0.32)]"
              >
                <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <AssetSelect label="To" selected={toAsset} blockedAssetId={fromAsset.id} onSelect={selectTo} />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                  You receive
                </p>
                <p className="text-xs text-white/45">{toAsset.routeHint}</p>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.025] px-3 py-4">
                <p className="text-3xl font-semibold text-white">
                  {formatAmount(estimatedOutput) || "0"}{" "}
                  <span className="text-base text-white/45">{toAsset.symbol}</span>
                </p>
                <p className="mt-2 text-xs text-white/45">
                  Estimated output only. Final routing is mocked while swap integrations are being
                  prepared.
                </p>
              </div>
            </div>

            <Button className="h-12 w-full" disabled>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Preview swap
            </Button>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="border-white/12">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                Route
              </CardTitle>
              <CardDescription>veBTC / veMEZO </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <p className="text-sm font-semibold text-white">{route.join(" -> ")}</p>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  Routing can wrap or unwrap between Mezo Earn positions, ERC1155 fractions, and
                  ERC20 liquidity tokens.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Estimated output</span>
                  <span className="font-medium text-white">
                    {formatAmount(estimatedOutput) || "0"} {toAsset.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Price impact</span>
                  <span className="font-medium text-emerald-100">{priceImpact.toFixed(2)}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Liquidity</span>
                  <span className="font-medium text-white">{formatUsd(routeLiquidity)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/55">Route rate</span>
                  <span className="font-medium text-white">
                    1 {fromAsset.symbol} = {formatAmount(pairPrice * routeEfficiency)} {toAsset.symbol}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/12">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                Asset path
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[fromAsset, toAsset].map((asset) => (
                <div key={asset.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{asset.symbol}</p>
                      <p className="mt-1 text-xs text-white/45">{asset.name}</p>
                    </div>
                    <Badge className={cn("normal-case tracking-normal", assetTone(asset))}>
                      {getAssetKindLabel(asset.kind)}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-xs leading-5 text-amber-100">
                <BadgeInfo className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                This interface uses local mock data. Swap contracts and live transaction writes are
                not connected yet.
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
