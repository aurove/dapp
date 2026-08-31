import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/seo/site";

/** Legacy trade path; the product swap interface lives at /swap. */
export const metadata: Metadata = createPageMetadata({
  title: "Trade",
  description: "Trade liquid ve-yield assets on Aurove. Redirecting to the Aurove swap interface.",
  path: "/swap",
  noIndex: true,
});

export default function TradeRedirectPage() {
  redirect("/swap");
}
