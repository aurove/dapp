import type { Metadata } from "next";

/** Canonical production origin used for metadata, sitemap, and structured data. */
export const SITE_URL = "https://www.aurove.xyz";

export const SITE_NAME = "Aurove";

export const SITE_TAGLINE = "Liquid ve-Yield for Mezo Earn";

export const DEFAULT_TITLE = "Aurove — Liquid ve-Yield for Mezo Earn";

export const DEFAULT_DESCRIPTION =
  "Maximize veBTC and veMEZO yields through liquid, tradable yield assets on Mezo Earn. Deposit, swap, provide liquidity, and keep earning.";

export const TWITTER_HANDLE = "@aurove_xyz";

/** Default social preview image (1200×630). */
export const DEFAULT_OG_IMAGE_PATH = "/og/default.jpg";

export const DEFAULT_KEYWORDS = [
  "Aurove",
  "veBTC",
  "veMEZO",
  "Mezo Earn",
  "liquid ve-yield",
  "Bitcoin DeFi",
  "Mezo",
  "liquid staking",
  "swap",
  "liquidity",
] as const;

type PageMetadataInput = {
  title: string;
  description: string;
  /** Absolute path on the site, e.g. `/earn`. */
  path: string;
  keywords?: readonly string[];
  /** Use an absolute document title (skips the root title template). */
  absoluteTitle?: boolean;
  noIndex?: boolean;
  ogImagePath?: string;
};

function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? SITE_URL : `${SITE_URL}${normalized}`;
}

/**
 * Builds consistent page metadata (title, description, OG, Twitter, canonical).
 * Titles shorter than the full brand line use the root layout template (`%s · Aurove`).
 */
export function createPageMetadata({
  title,
  description,
  path,
  keywords,
  absoluteTitle = false,
  noIndex = false,
  ogImagePath = DEFAULT_OG_IMAGE_PATH,
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(ogImagePath);
  const resolvedTitle = absoluteTitle
    ? { absolute: title }
    : title;

  return {
    title: resolvedTitle,
    description,
    keywords: keywords ? [...keywords] : undefined,
    alternates: {
      canonical: url,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
      creator: TWITTER_HANDLE,
      site: TWITTER_HANDLE,
    },
  };
}
