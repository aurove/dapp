import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
} from "./site";

function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? SITE_URL : `${SITE_URL}${normalized}`;
}

/** Organization + WebSite graph for the marketing homepage. */
export function getHomeJsonLd() {
  const logoUrl = absoluteUrl("/logo_mark.png");
  const imageUrl = absoluteUrl(DEFAULT_OG_IMAGE_PATH);
  const twitterUrl = `https://x.com/${TWITTER_HANDLE.replace(/^@/, "")}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION,
        logo: {
          "@type": "ImageObject",
          url: logoUrl,
        },
        image: imageUrl,
        sameAs: [twitterUrl],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: SITE_TAGLINE,
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION,
        publisher: {
          "@id": `${SITE_URL}/#organization`,
        },
        inLanguage: "en-US",
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        isPartOf: {
          "@id": `${SITE_URL}/#website`,
        },
        about: {
          "@id": `${SITE_URL}/#organization`,
        },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: imageUrl,
        },
        inLanguage: "en-US",
      },
    ],
  };
}

/** WebPage graph for product surfaces (Earn, Liquidity, Academy, docs hub). */
export function getWebPageJsonLd(input: {
  path: string;
  title: string;
  description: string;
}) {
  const url = absoluteUrl(input.path);
  const imageUrl = absoluteUrl(DEFAULT_OG_IMAGE_PATH);

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.title,
    description: input.description,
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
    about: {
      "@id": `${SITE_URL}/#organization`,
    },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: imageUrl,
    },
    inLanguage: "en-US",
  };
}

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function getBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** TechArticle + breadcrumbs for a documentation page. */
export function getDocArticleJsonLd(input: {
  slug: string;
  title: string;
  description: string;
  section: string;
}) {
  const path = `/docs/${input.slug}`;
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(DEFAULT_OG_IMAGE_PATH);

  const breadcrumbs = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Docs", path: "/docs" },
    { name: input.section, path: "/docs" },
    { name: input.title, path },
  ]);

  const article = {
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: input.title,
    name: input.title,
    description: input.description,
    url,
    mainEntityOfPage: url,
    isPartOf: {
      "@id": `${SITE_URL}/#website`,
    },
    author: {
      "@id": `${SITE_URL}/#organization`,
    },
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    image: imageUrl,
    inLanguage: "en-US",
    articleSection: input.section,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [article, breadcrumbs],
  };
}

export type FaqItem = {
  question: string;
  answer: string;
};

/** FAQPage JSON-LD from question/answer pairs. */
export function getFaqPageJsonLd(input: {
  path: string;
  title: string;
  description: string;
  items: readonly FaqItem[];
}) {
  const url = absoluteUrl(input.path);

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    name: input.title,
    description: input.description,
    mainEntity: input.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/**
 * Canonical FAQ pairs for /docs/faq (page body + FAQPage schema).
 * Keep answers plain text for structured data.
 */
export const AUROVE_FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Why do I only see Connect Wallet?",
    answer:
      "You are disconnected. Connect via the header and approve the connection in your wallet.",
  },
  {
    question: "What does Wrong Network mean?",
    answer:
      "Your wallet chain is not the deployment’s expected chain. Click Wrong Network and approve the network switch.",
  },
  {
    question: "What is Sign In for?",
    answer:
      "A signed session for Academy personalization (points and referral link). Earn, Swap, and LP primarily need a connected wallet.",
  },
  {
    question: "Why do I have no liquid positions yet?",
    answer:
      "Deposit BTC or MEZO or a veNFT via Create Position on Earn, or acquire liquid assets via Swap.",
  },
  {
    question: "What does Await redemption window mean?",
    answer:
      "Redemptions are only available during the weekly window: it opens 10 hours into each epoch and lasts 6 hours.",
  },
  {
    question: "Why is there no route or insufficient liquidity on Swap?",
    answer:
      "The registry could not find a concentrated-liquidity path for that pair or amount. Try another asset or reduce the size.",
  },
  {
    question: "What does Unsupported source combo mean on Liquidity?",
    answer:
      "Selected funding sources cannot be combined for the zap plan. Change sources or choose another pool.",
  },
  {
    question: "Why do Academy points show “Visible after wallet authentication”?",
    answer:
      "Connect your wallet and Sign In. Without a session, personalized Academy stats stay locked.",
  },
] as const;

/** Safe JSON-LD script content (escapes `<` to reduce XSS risk). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
