import type { Metadata } from "next";
import { EarnPage } from "@/components/features/earn";
import { ProductSeo } from "@/components/site/product-seo";
import { createPageMetadata } from "@/lib/seo/site";

const TITLE = "Liquid veBTC & veMEZO Earn";
const DESCRIPTION =
  "Deposit BTC, MEZO, or a Mezo Earn position into liquid Aurove assets. Keep earning from locked veBTC and veMEZO while staying free to swap.";

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/earn",
  keywords: [
    "Aurove Earn",
    "veBTC",
    "veMEZO",
    "Mezo Earn",
    "liquid ve-yield",
    "Bitcoin DeFi",
  ],
});

export default function AppEarnPage() {
  return (
    <div className="space-y-6">
      <ProductSeo
        path="/earn"
        title={TITLE}
        description={DESCRIPTION}
        bullets={[
          "Deposit BTC or MEZO to create managed liquid positions (avBTCm / avMEZOm).",
          "Deposit an existing veBTC or veMEZO NFT without fully unwinding the lock yourself.",
          "Hold liquid inventory you can swap, use as LP funding, or redeem in settlement windows.",
          "Claim tranche and gauge rewards from the Earn dashboard when available.",
        ]}
        relatedLinks={[
          { href: "/docs/earn/managed-yield", label: "Managed yield docs" },
          { href: "/docs/earn/vebtc", label: "veBTC guide" },
          { href: "/docs/swap/flows", label: "Swap flows" },
          { href: "/liquidity", label: "Provide liquidity" },
        ]}
      />
      <EarnPage />
    </div>
  );
}
