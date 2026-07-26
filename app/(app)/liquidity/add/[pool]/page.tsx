import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddLiquidityPage } from "@/components/features/liquidity/add-liquidity-page";
import type { SlipstreamPoolKey } from "@/components/features/liquidity/slipstream-adapter";
import { createPageMetadata } from "@/lib/seo/site";

const POOL_META = {
  BTC: {
    title: "Add Liquidity · MUSD / avBTCm",
    description:
      "Add concentrated liquidity to the Aurove MUSD / avBTCm pool. Configure your range and keep liquid BTC Earn exposure working.",
  },
  MEZO: {
    title: "Add Liquidity · avBTCm / avMEZOm",
    description:
      "Add concentrated liquidity to the Aurove avBTCm / avMEZOm pool. Earn swap fees across liquid BTC and MEZO yield assets.",
  },
} as const satisfies Record<
  SlipstreamPoolKey,
  { title: string; description: string }
>;

type PoolPageParams = { pool: string };

function resolvePoolKey(pool: string): SlipstreamPoolKey | null {
  const poolKey = pool.toUpperCase();
  if (poolKey === "BTC" || poolKey === "MEZO") return poolKey;
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PoolPageParams>;
}): Promise<Metadata> {
  const { pool } = await params;
  const poolKey = resolvePoolKey(pool);

  if (!poolKey) {
    return createPageMetadata({
      title: "Liquidity pool not found",
      description: "The requested Aurove liquidity pool could not be found.",
      path: "/liquidity",
      noIndex: true,
    });
  }

  const meta = POOL_META[poolKey];
  return createPageMetadata({
    title: meta.title,
    description: meta.description,
    path: `/liquidity/add/${poolKey.toLowerCase()}`,
    keywords: [
      "Aurove liquidity",
      poolKey === "BTC" ? "MUSD" : "avMEZOm",
      "avBTCm",
      "concentrated liquidity",
      "Mezo Earn",
    ],
  });
}

export default async function PoolLiquidityPage({
  params,
}: {
  params: Promise<PoolPageParams>;
}) {
  const { pool } = await params;
  const poolKey = resolvePoolKey(pool);
  if (!poolKey) notFound();
  return <AddLiquidityPage poolKey={poolKey} />;
}
