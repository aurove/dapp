"use client";

import Link from "next/link";
import { ArrowLeftRight, ExternalLink, Layers2, Plus } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";
import type { HorizonBridgeAsset } from "@/lib/bridge/horizon";
import {
  areAerodromePoolsReady,
  getAerodromeDocs,
  getAerodromePoolConfigs,
  getAerodromePoolForAsset,
  getAerodromeRouterConfig,
  getBaseSepoliaAddressUrl,
  shortAerodromeAddress,
  type AerodromePoolConfig,
} from "@/lib/bridge/aerodrome-pools";

type UseOnAerodromePanelProps = {
  /** Currently selected bridge family asset — highlights the matching pool. */
  asset: HorizonBridgeAsset;
};

function PoolRow({
  pool,
  highlighted,
}: {
  pool: AerodromePoolConfig;
  highlighted: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlighted
          ? "border-[var(--accent)]/50 bg-[var(--accent)]/8"
          : "border-[var(--line)] bg-foreground/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {pool.shareSymbol} / MUSD
          </p>
          <Badge className="normal-case tracking-normal text-[10px]">
            CL{pool.tickSpacing}
          </Badge>
          {highlighted ? (
            <Badge className="normal-case tracking-normal text-[10px]">Selected</Badge>
          ) : null}
        </div>
        {pool.ready && pool.pool ? (
          <a
            className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            href={getBaseSepoliaAddressUrl(pool.pool)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAerodromeAddress(pool.pool)}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted">Pool pending</span>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">
        Peer {shortAerodromeAddress(pool.share)}
        {pool.musd ? ` · MUSD ${shortAerodromeAddress(pool.musd)}` : " · MUSD TBD (DemoMUSD)"}
      </p>
    </div>
  );
}

export function UseOnAerodromePanel({ asset }: UseOnAerodromePanelProps) {
  const pools = getAerodromePoolConfigs();
  const selected = getAerodromePoolForAsset(asset);
  const routers = getAerodromeRouterConfig();
  const ready = areAerodromePoolsReady(pools);
  const docs = getAerodromeDocs();
  const peerSymbol = selected.shareSymbol;

  const swapHref =
    selected.pool != null
      ? getBaseSepoliaAddressUrl(selected.pool)
      : routers.swapRouter
        ? getBaseSepoliaAddressUrl(routers.swapRouter)
        : null;
  const lpHref =
    selected.pool != null
      ? getBaseSepoliaAddressUrl(selected.pool)
      : routers.positionManager
        ? getBaseSepoliaAddressUrl(routers.positionManager)
        : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Use on Aerodrome</CardTitle>
            <CardDescription className="mt-1">
              After withdraw lands on Base Sepolia, trade or LP the vault peer against MUSD on Aerodrome
              Slipstream.
            </CardDescription>
          </div>
          <Badge className="normal-case tracking-normal shrink-0">Base Sepolia</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2 text-sm leading-5 text-muted">
          <li className="flex gap-2">
            <span className="font-medium text-foreground">1.</span>
            <span>Convert lock / ID20 / tranche → vault share on Mezo.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-foreground">2.</span>
            <span>Bridge the share via Wormhole NTT → peer token on Base.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-foreground">3.</span>
            <span>
              Swap {peerSymbol} → MUSD or add {peerSymbol} / MUSD liquidity on Aerodrome.
            </span>
          </li>
        </ol>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Configured pools</p>
          {pools.map((pool) => (
            <PoolRow key={pool.key} pool={pool} highlighted={pool.asset === asset} />
          ))}
        </div>

        {ready ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {swapHref ? (
              <Button asChild className="w-full">
                <a href={swapHref} target="_blank" rel="noreferrer">
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Swap {peerSymbol} → MUSD
                  <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
                </a>
              </Button>
            ) : null}
            {lpHref ? (
              <Button asChild variant="outline" className="w-full">
                <a href={lpHref} target="_blank" rel="noreferrer">
                  <Plus className="mr-2 h-4 w-4" />
                  Add liquidity
                  <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-[var(--line)] p-4">
            <div className="flex gap-3">
              <Layers2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Pools deploy pending</p>
                <p className="text-xs leading-5 text-muted">
                  Slipstream CL200 pools for avMEZOv/MUSD and avBTCv/MUSD are not on Base Sepolia yet.
                  After broadcast, set{" "}
                  <code className="text-[11px]">NEXT_PUBLIC_AERO_*_POOL</code> (and MUSD) to unlock
                  these CTAs.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={docs.poolsRunbook} target="_blank" rel="noreferrer">
                  Horizon aero runbook
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={docs.aerodrome} target="_blank" rel="noreferrer">
                  Aerodrome
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs leading-5 text-muted">
          Deposit path is unchanged — use Deposit to return peer tokens to Mezo.{" "}
          <Link href="/earn" className="text-[var(--accent)] hover:underline">
            Earn positions
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
