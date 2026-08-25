import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddLiquidityPage } from "@/components/features/liquidity/add-liquidity-page";
import {
  AUROVE_LIQUIDITY_PAIRS,
  resolveAuroveLiquidityPairRoute,
  type AuroveLiquidityPair,
} from "@/lib/config/supported-liquidity-pools";
import { createPageMetadata } from "@/lib/seo/site";

type PoolPageParams = { pool: string };

export function generateStaticParams(): PoolPageParams[] {
  return AUROVE_LIQUIDITY_PAIRS.map((pair) => ({ pool: pair.routeSlug }));
}

function metadataForPair(pair: AuroveLiquidityPair) {
  if (pair.key === "BTC") {
    return {
      title: `Add Liquidity · ${pair.pairLabel}`,
      description:
        "Add concentrated liquidity to the Aurove MUSD / avBTCm pool. Configure your range and keep liquid BTC Earn exposure working.",
    };
  }
  return {
    title: `Add Liquidity · ${pair.pairLabel}`,
    description:
      "Add concentrated liquidity to the Aurove avBTCm / avMEZOm pool. Earn swap fees across liquid BTC and MEZO yield assets.",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PoolPageParams>;
}): Promise<Metadata> {
  const { pool } = await params;
  const pair = resolveAuroveLiquidityPairRoute(pool);

  if (!pair) {
    return createPageMetadata({
      title: "Liquidity pool not found",
      description: "The requested Aurove liquidity pool could not be found.",
      path: "/liquidity",
      noIndex: true,
    });
  }

  const meta = metadataForPair(pair);
  return createPageMetadata({
    title: meta.title,
    description: meta.description,
    path: `/liquidity/add/${pair.routeSlug}`,
    keywords: [
      "Aurove liquidity",
      pair.key === "BTC" ? "MUSD" : "avMEZOm",
      "avBTCm",
      "concentrated liquidity",
      "Mezo Earn",
    ],
  });
}

export default async function PoolLiquidityPage({ params }: { params: Promise<PoolPageParams> }) {
  const { pool } = await params;
  const pair = resolveAuroveLiquidityPairRoute(pool);
  if (!pair) notFound();
  return <AddLiquidityPage pair={pair} />;
}
