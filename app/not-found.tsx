import type { Metadata } from "next";
import { RouteFallback } from "@/components/site/route-fallback";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createPageMetadata({
  title: "Page Not Found",
  description:
    "This Aurove route could not be found. Return home to explore liquid ve-yield for Mezo Earn.",
  path: "/",
  noIndex: true,
});

export default function NotFound() {
  return (
    <RouteFallback
      variant="not-found"
      eyebrow="Lost route"
      title="This page drifted off the Aurove map."
      description="The link you followed does not resolve to a live Aurove route. Head back to the home page to continue exploring the liquid ve-yield layer."
      primaryLabel="Back to home"
      primaryHref="/"
      note="This route may have moved, been retired, or never existed. The home page will get you back on course."
    />
  );
}
