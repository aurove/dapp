import type { MetadataRoute } from "next";
import { flattenDocsNav } from "@/lib/docs/navigation";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Indexable public product surfaces only.
 * Redirect-only routes (/trade) and API routes are omitted.
 *
 * Uses navigation (not content/docs/pages) so sitemap generation stays
 * lightweight and always returns XML quickly for Search Console crawlers.
 */
export const dynamic = "force-static";

type SitemapEntry = MetadataRoute.Sitemap[number];

function entry(
  path: string,
  priority: number,
  changeFrequency: SitemapEntry["changeFrequency"],
  lastModified: Date,
): SitemapEntry {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  return { url, lastModified, changeFrequency, priority };
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Date-only lastmod (stable, GSC-friendly). Recomputed at build/prerender time.
  const lastModified = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  const productRoutes: MetadataRoute.Sitemap = [
    entry("/", 1, "weekly", lastModified),
    entry("/swap", 0.9, "weekly", lastModified),
    entry("/liquidity", 0.9, "weekly", lastModified),
    entry("/vote", 0.9, "weekly", lastModified),
    entry("/liquidity/add/btc", 0.7, "monthly", lastModified),
    entry("/liquidity/add/mezo", 0.7, "monthly", lastModified),
    entry("/earn", 0.9, "weekly", lastModified),
    entry("/earn/stake/btc", 0.7, "monthly", lastModified),
    entry("/earn/stake/mezo", 0.7, "monthly", lastModified),
    entry("/academy", 0.8, "weekly", lastModified),
    entry("/docs", 0.85, "weekly", lastModified),
  ];

  const docRoutes: MetadataRoute.Sitemap = flattenDocsNav().map((item) =>
    entry(`/docs/${item.slug}`, 0.7, "weekly", lastModified),
  );

  return [...productRoutes, ...docRoutes];
}
