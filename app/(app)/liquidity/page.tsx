import type { Metadata } from "next";
import { LiquidityPage } from "@/components/features/liquidity";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Provide Liquidity for Liquid ve-Yield",
  description:
    "Supply liquidity with locked BTC and MEZO exposure. Earn swap fees on Aurove pools while Mezo Earn positions keep working underneath.",
  path: "/liquidity",
  keywords: [
    "Aurove liquidity",
    "concentrated liquidity",
    "avBTCm",
    "avMEZOm",
    "Mezo Earn",
    "swap fees",
  ],
});

export default function AppLiquidityPage() {
  return <LiquidityPage />;
}
