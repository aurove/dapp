import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Public crawl rules. Disallows private/internal APIs and auth endpoints.
 * Does not block shareable product pages (earn, liquidity, academy).
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/trade"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Host without scheme (robots.txt convention used by Yandex; Google ignores).
    host: "www.aurove.xyz",
  };
}
