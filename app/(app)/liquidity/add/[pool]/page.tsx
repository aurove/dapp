import { notFound } from "next/navigation";
import { AddLiquidityPage } from "@/components/features/liquidity/add-liquidity-page";
import type { SlipstreamPoolKey } from "@/components/features/liquidity/slipstream-adapter";

export default async function PoolLiquidityPage({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  const poolKey = pool.toUpperCase();
  if (poolKey !== "BTC" && poolKey !== "MEZO") notFound();
  return <AddLiquidityPage poolKey={poolKey as SlipstreamPoolKey} />;
}
