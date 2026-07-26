import type { Metadata } from "next";
import { EarnPage } from "@/components/features/earn";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Liquid veBTC & veMEZO Earn",
  description:
    "Deposit BTC, MEZO, or a Mezo Earn position into liquid Aurove assets. Keep earning from locked veBTC and veMEZO while staying free to swap.",
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
  return <EarnPage />;
}
