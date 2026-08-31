import type { DocNavSection, DocStatus } from "./types";

export const DOCS_NAV: DocNavSection[] = [
  {
    title: "Guides",
    items: [
      { title: "What is Aurove", slug: "guides/what-is-aurove" },
      { title: "Prerequisites", slug: "guides/prerequisites" },
      { title: "Connect a wallet", slug: "guides/connect-wallet" },
      { title: "Swap", slug: "guides/swap" },
      { title: "Provide liquidity", slug: "guides/liquidity" },
      { title: "Price ranges and fees", slug: "guides/price-range" },
      { title: "Create a liquid position", slug: "guides/create-position" },
      { title: "Understand Aurove assets", slug: "guides/assets" },
      { title: "View positions", slug: "guides/positions" },
      { title: "Claim rewards", slug: "guides/rewards" },
      { title: "Redeem", slug: "guides/redeem" },
      { title: "Academy", slug: "guides/academy" },
      { title: "Risks", slug: "guides/risks" },
    ],
  },
  {
    title: "Protocol",
    items: [
      { title: "How Aurove works", slug: "protocol/overview" },
      { title: "Assets and representations", slug: "protocol/assets" },
      { title: "Custody and redemption", slug: "protocol/custody" },
      { title: "Rewards and epochs", slug: "protocol/rewards" },
      { title: "Concentrated liquidity", slug: "protocol/liquidity" },
      { title: "Upgradeability and roles", slug: "protocol/roles" },
      { title: "Security and limitations", slug: "protocol/security" },
    ],
  },
  {
    title: "Developers",
    items: [
      { title: "Chain configuration", slug: "developers/chain" },
      { title: "Deployment reference", slug: "developers/deployment" },
      { title: "Architecture", slug: "developers/architecture" },
      { title: "Earn integration", slug: "developers/earn" },
      { title: "Swap and liquidity integration", slug: "developers/liquidity" },
      { title: "Events, errors, and indexing", slug: "developers/events" },
    ],
  },
  {
    title: "Reference",
    items: [{ title: "FAQ", slug: "faq" }],
  },
];

export function flattenDocsNav(): Array<{
  title: string;
  slug: string;
  section: string;
  status?: DocStatus;
}> {
  return DOCS_NAV.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      section: section.title,
    })),
  );
}

export function getAdjacentDocs(slug: string) {
  const flat = flattenDocsNav();
  const index = flat.findIndex((item) => item.slug === slug);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index < flat.length - 1 ? flat[index + 1] : null,
  };
}

export function getDocSectionTitle(slug: string): string {
  for (const section of DOCS_NAV) {
    if (section.items.some((item) => item.slug === slug)) return section.title;
  }
  return "Documentation";
}
