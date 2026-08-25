"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useChainId } from "wagmi";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";
import { TokenMarks } from "@/components/features/shared/token-marks";
import { getEarnProtocolConfig } from "@/contracts/earn";
import { EARN_ASSETS, earnStakePath, type EarnAssetDefinition } from "./earn-asset";
import { useAprBasis, useEarnSnapshot } from "./use-earn-data";
import { summarizeAssetApr, type AssetAprSummary } from "./utils/apr";

function AssetCard({
  asset,
  apr,
  available,
}: {
  asset: EarnAssetDefinition;
  apr: AssetAprSummary;
  available: boolean;
}) {
  return (
    <Link
      href={earnStakePath(asset.key)}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      aria-label={`Create ${asset.productSymbol} position`}
    >
      <Card className="h-full border-white/10 bg-white/[0.035] transition duration-200 group-hover:-translate-y-0.5 group-hover:border-[var(--accent)]/35 group-hover:bg-white/[0.05]">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <TokenMarks marks={asset.marks} />
            <div>
              <CardTitle className="text-lg">{asset.title}</CardTitle>
              <CardDescription className="mt-1">{asset.description}</CardDescription>
            </div>
          </div>
          <Badge
            className={
              available
                ? "w-fit border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                : "w-fit border-white/15 bg-white/5 text-white/60"
            }
          >
            {available ? "Available" : "Unavailable"}
          </Badge>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-4 border-t border-white/8 pt-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Annualised APR</p>
            <p className="mt-1 text-sm text-white/75">{apr.value}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--accent)]">
            Create position{" "}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export function AvailableEarningAssets() {
  const chainId = useChainId();
  const { products } = useEarnSnapshot();
  const earnConfig = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const aprQuery = useAprBasis({
    enabled: true,
    products,
    chainId,
    ledgerAbi: earnConfig.ledger?.abi,
  });
  const aprBasisMap = aprQuery.data ?? {};
  const aprLoading = aprQuery.isLoading || aprQuery.isFetching;

  return (
    <section
      id="available-assets"
      className="scroll-mt-6 space-y-4"
      aria-labelledby="available-assets-title"
    >
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h1 id="available-assets-title" className="text-2xl font-semibold text-white">
            Turn Mezo Earn positions into liquid assets you can use.
          </h1>
        </div>
        <p className="mt-1 text-sm text-white/55">
          Deposit BTC, MEZO, or an existing locked Mezo Earn position and receive a liquid Aurove
          asset. Keep earning from the underlying position while remaining free to swap.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {EARN_ASSETS.map((asset) => {
          const available = Boolean(
            earnConfig.ledger?.address &&
            (asset.variant === "veBTC" ? earnConfig.veBtc?.address : earnConfig.veMezo?.address),
          );
          return (
            <AssetCard
              key={asset.key}
              asset={asset}
              available={available}
              apr={summarizeAssetApr({
                products,
                variant: asset.variant,
                aprBasisMap,
                isLoading: aprLoading,
              })}
            />
          );
        })}
      </div>
    </section>
  );
}
