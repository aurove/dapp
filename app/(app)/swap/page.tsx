import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/seo/site";

/** Canonical swap UX lives on the homepage; keep this path as a redirect only. */
export const metadata: Metadata = createPageMetadata({
  title: "Swap",
  description:
    "Swap liquid ve-yield assets on Aurove. Redirecting to the Aurove swap interface.",
  path: "/",
  noIndex: true,
});

export default function AppSwapPage() {
  redirect("/#swap-interface");
}
