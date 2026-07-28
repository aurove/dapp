import type { MetadataRoute } from "next";
import { getAllDocSlugs } from "@/content/docs/pages";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Indexable public product surfaces only.
 * Redirect-only routes (/swap, /trade) and API routes are omitted.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const productRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/earn`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/liquidity`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/liquidity/add/btc`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/liquidity/add/mezo`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/academy`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/docs`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
    },
  ];

  const docRoutes: MetadataRoute.Sitemap = getAllDocSlugs().map((slug) => ({
    url: `${SITE_URL}/docs/${slug}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...productRoutes, ...docRoutes];
}
