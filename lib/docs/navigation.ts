import type { DocNavSection, DocStatus } from "./types";

export const DOCS_NAV: DocNavSection[] = [
  {
    title: "Introduction",
    items: [
      { title: "What is Aurove", slug: "introduction/what-is-aurove", status: "live" },
      { title: "Why Aurove", slug: "introduction/why-aurove", status: "live" },
      {
        title: "Architecture overview",
        slug: "introduction/architecture-overview",
        status: "live",
      },
    ],
  },
  {
    title: "Getting started",
    items: [
      { title: "Connect wallet", slug: "getting-started/connect-wallet", status: "live" },
      { title: "Faucet & test tokens", slug: "getting-started/faucet", status: "live" },
      {
        title: "First transaction",
        slug: "getting-started/first-transaction",
        status: "live",
      },
    ],
  },
  {
    title: "Earn",
    items: [
      { title: "veBTC", slug: "earn/vebtc", status: "live" },
      { title: "veMEZO", slug: "earn/vemezo", status: "live" },
      { title: "Managed yield", slug: "earn/managed-yield", status: "live" },
      { title: "Tranches", slug: "earn/tranches", status: "live" },
    ],
  },
  {
    title: "Trade",
    items: [
      { title: "Marketplace overview", slug: "trade/marketplace", status: "live" },
      { title: "Fractions", slug: "trade/fractions", status: "live" },
      { title: "Swapping", slug: "trade/swapping", status: "live" },
    ],
  },
  {
    title: "Liquidity",
    items: [
      {
        title: "Providing liquidity",
        slug: "liquidity/providing-liquidity",
        status: "live",
      },
      {
        title: "Concentrated liquidity",
        slug: "liquidity/concentrated-liquidity",
        status: "live",
      },
      { title: "Gauges", slug: "liquidity/gauges", status: "live" },
    ],
  },
  {
    title: "Academy",
    items: [
      { title: "Points", slug: "academy/points", status: "live" },
      { title: "Quests & tasks", slug: "academy/quests", status: "live" },
      { title: "Referrals", slug: "academy/referrals", status: "live" },
    ],
  },
  {
    title: "Protocol",
    items: [
      { title: "ID20", slug: "protocol/id20", status: "live" },
      { title: "Ledger", slug: "protocol/ledger", status: "live" },
      { title: "Vaults", slug: "protocol/vaults", status: "live" },
      { title: "Rewards", slug: "protocol/rewards", status: "live" },
      { title: "Security model", slug: "protocol/security-model", status: "live" },
    ],
  },
  {
    title: "Developers",
    items: [
      { title: "Contracts", slug: "developers/contracts", status: "live" },
      { title: "Integrations", slug: "developers/integrations", status: "live" },
      { title: "Events", slug: "developers/events", status: "live" },
      { title: "API", slug: "developers/api", status: "live" },
    ],
  },
  {
    title: "Reference",
    items: [{ title: "FAQ", slug: "faq", status: "live" }],
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
