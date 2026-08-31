import type { Metadata } from "next";
import { LiquidityPage } from "@/components/features/liquidity";
import { ProductSeo } from "@/components/site/product-seo";
import { createPageMetadata } from "@/lib/seo/site";

const TITLE = "Provide Liquidity for Liquid ve-Yield";
const DESCRIPTION =
  "Supply liquidity with locked BTC and MEZO exposure. Earn swap fees on Aurove pools while Mezo Earn positions keep working underneath.";

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
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
  return (
    <div className="space-y-6">
      <LiquidityPage />
      <ProductSeo
        path="/liquidity"
        title={TITLE}
        description={DESCRIPTION}
        bullets={[
          "Add concentrated liquidity to supported Aurove pools such as MUSD/avBTCm.",
          "Fund positions with liquid Aurove assets and compatible zap sources.",
          "Collect swap fees when trades pass through your active price range.",
          "Manage, increase, or remove liquidity from your position NFTs.",
        ]}
        relatedLinks={[
          { href: "/swap", label: "Swap" },
          { href: "/docs/guides/liquidity", label: "Provide liquidity" },
          { href: "/docs/guides/price-range", label: "Price ranges and fees" },
          { href: "/liquidity/add/btc", label: "Add BTC pool liquidity" },
          { href: "/earn", label: "Earn" },
        ]}
      />
    </div>
  );
}
