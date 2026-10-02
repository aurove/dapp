import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { ACADEMY_ENABLED } from "@/lib/academy/availability";

/**
 * Public crawl rules. Disallows private/internal APIs and auth endpoints.
 * Academy is excluded from crawlers while its product surface is disabled.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/trade",
          ...(ACADEMY_ENABLED ? [] : ["/academy", "/docs/guides/academy", "/docs/academy"]),
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Host without scheme (robots.txt convention used by Yandex; Google ignores).
    host: "www.aurove.xyz",
  };
}
