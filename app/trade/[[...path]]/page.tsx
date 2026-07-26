import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/seo/site";

/** Legacy trade path; product swap interface is on the homepage. */
export const metadata: Metadata = createPageMetadata({
  title: "Trade",
  description:
    "Trade liquid ve-yield assets on Aurove. Redirecting to the Aurove swap interface.",
  path: "/",
  noIndex: true,
});

export default function TradeRedirectPage() {
  redirect("/#swap-interface");
}
