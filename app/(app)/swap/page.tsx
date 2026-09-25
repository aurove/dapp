import type { Metadata } from "next";
import { SwapPage } from "@/components/features/swap";
import { ProductSeo } from "@/components/site/product-seo";
import { createPageMetadata } from "@/lib/seo/site";

const TITLE = "Swap locked BTC and MEZO";
const DESCRIPTION =
  "Swap locked BTC and MEZO through Aurove's supported routes and pools.";

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/swap",
  keywords: ["Aurove swap", "avBTCm", "avMEZOm", "Mezo Earn", "liquid ve-yield", "Bitcoin DeFi"],
});

export default function AppSwapPage() {
  return (
    <div className="space-y-6">
      <SwapPage />
      <ProductSeo
        path="/swap"
        title={TITLE}
        description={DESCRIPTION}
        bullets={[
          "Sell ERC-20 tokens, veNFT positions, or Ledger tranche units.",
          "Buy liquid ID20 tokens or other supported ERC-20 assets.",
          "Review quote, route, slippage, and deadline before signing.",
          "Some routes deposit and wrap into Aurove inventory before the pool swap.",
        ]}
        relatedLinks={[
          { href: "/docs/guides/swap", label: "Swap guide" },
          { href: "/liquidity", label: "Provide liquidity" },
          { href: "/earn", label: "Earn" },
        ]}
      />
    </div>
  );
}
