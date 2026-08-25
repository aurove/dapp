"use client";

import Link from "next/link";
import { ArrowRight, Droplets } from "lucide-react";
import { useChainId } from "wagmi";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";
import { TokenMarks } from "@/components/features/shared/token-marks";
import { getContractConfig } from "@/contracts/shared";
import {
  formatPriceLabel,
  resolveSlipstreamPoolContractName,
  type SlipstreamPoolKey,
} from "./slipstream-adapter";
import { useSlipstreamPoolState } from "./liquidity-range-graph";

const POOLS: readonly {
  key: SlipstreamPoolKey;
  title: string;
  description: string;
  marks: readonly string[];
}[] = [
  {
    key: "BTC",
    title: "MUSD / avBTCm",
    description: "Provide MUSD and liquid BTC Earn exposure.",
    marks: ["MUSD", "BTC"],
  },
  {
    key: "MEZO",
    title: "avBTCm / avMEZOm",
    description: "Provide liquidity across Aurove BTC and MEZO assets.",
    marks: ["BTC", "MEZO"],
  },
];

function PoolCard({
  poolKey,
  title,
  description,
  marks,
}: {
  poolKey: SlipstreamPoolKey;
  title: string;
  description: string;
  marks: readonly string[];
}) {
  const chainId = useChainId();
  const pool = useSlipstreamPoolState(chainId, poolKey);
  const configured = Boolean(
    getContractConfig(chainId, resolveSlipstreamPoolContractName(poolKey))?.address,
  );
  const price =
    pool.currentTick === null
      ? "Price unavailable"
      : formatPriceLabel({ pool, tick: pool.currentTick });

  if (!configured) return null;
  return (
    <Link
      href={`/liquidity/add/${poolKey.toLowerCase()}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <Card className="h-full border-white/10 bg-white/[0.035] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--accent)]/35 group-hover:bg-white/[0.05]">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <TokenMarks marks={marks} />
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          <Badge className="w-fit border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
            Available
          </Badge>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-4 border-t border-white/8 pt-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Current pool price</p>
            <p className="mt-1 text-sm text-white/75">{price}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--accent)]">
            Add liquidity{" "}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function AvailableLiquidityPools() {
  return (
    <section
      id="available-pools"
      className="scroll-mt-6 space-y-4"
      aria-labelledby="available-pools-title"
    >
      <div>
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h1 id="available-pools-title" className="text-2xl font-semibold text-white">
            Supply liquidity with your locked BTC and locked MEZO.
          </h1>
        </div>
        <p className="mt-1 text-sm text-white/55">
          Add another income stream to your Mezo Earn positions. Keep earning in Mezo Earn while
          collecting swap fees whenever trades move through your active price range.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {POOLS.map((pool) => (
          <PoolCard
            key={pool.key}
            poolKey={pool.key}
            title={pool.title}
            description={pool.description}
            marks={pool.marks}
          />
        ))}
      </div>
    </section>
  );
}
