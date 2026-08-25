import { Callout } from "@/components/docs/callout";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { getDocSectionTitle } from "@/lib/docs/navigation";
import type { DocFrontmatter, DocPageDefinition, DocSearchDocument } from "@/lib/docs/types";
import { DEVELOPER_PAGES } from "./developers";
import { GUIDE_PAGES } from "./guides";
import { PROTOCOL_PAGES } from "./protocol";

export type { DocPageDefinition };

const FAQ_PAGE: DocPageDefinition = {
  slug: "faq",
  title: "FAQ",
  description: "Answers to common wallet, Earn, Swap, Liquidity, and Academy questions.",
  tags: ["faq", "wallet", "earn", "swap"],
  searchText: "faq connect wallet wrong network sign in redeem swap liquidity academy",
  Content: () => (
    <>
      <h1>FAQ</h1>
      <h2>Wallet and network</h2>
      <h3>Why do I only see Connect Wallet?</h3>
      <p>
        You are disconnected. Click <strong>Connect Wallet</strong> in the header and approve the
        connection in your wallet.
      </p>
      <h3>What does Wrong Network mean?</h3>
      <p>
        Your wallet is not on Mezo Mainnet (chain id 31612). Click <strong>Wrong Network</strong> and
        approve the switch. The header should then read <strong>Network Mezo Mainnet</strong>.
      </p>
      <h3>What is Sign In for?</h3>
      <p>
        A signed session for Academy points, tasks, and your referral link. Earn, Swap, and Liquidity
        only need a connected wallet on Mezo Mainnet.
      </p>
      <h2>Earn</h2>
      <h3>Why do I have no liquid positions yet?</h3>
      <p>
        Earn mints avBTCm or avMEZOm only after a successful deposit, and Swap only after you buy
        those tokens. If a deposit reverts, the managers may still have <code>mTokenId = 0</code>,
        which blocks managed Mezo deposits.
      </p>
      <h3>Does Aurove use a weekly redemption window?</h3>
      <p>
        No. Aurove does not add a settlement window. Redeem burns ERC-1155 units and releases veNFT
        inventory whenever Mezo allows that managed withdraw. Mezo epoch rules can still cause a
        revert.
      </p>
      <h2>Swap</h2>
      <h3>Why is there no route or insufficient liquidity on Swap?</h3>
      <p>
        The registry could not find a concentrated-liquidity path for that pair or amount, or the
        Aurove pools have no inventory yet. Try another asset or reduce the size.
      </p>
      <h2>Liquidity</h2>
      <h3>What does Unsupported source combo mean on Liquidity?</h3>
      <p>
        The selected funding sources cannot be combined into a zap plan. Change sources or choose the
        other pool.
      </p>
      <h2>Academy</h2>
      <h3>Why do Academy points show “Visible after wallet authentication”?</h3>
      <p>
        Connect your wallet and click <strong>Sign In</strong>. Without a session, personalized
        Academy stats stay locked.
      </p>
      <Callout variant="info">
        For contract addresses see{" "}
        <DocRouteLink href="/docs/developers/deployment">Deployment reference</DocRouteLink>. For
        current launch limits see{" "}
        <DocRouteLink href="/docs/protocol/security">Security and limitations</DocRouteLink>.
      </Callout>
    </>
  ),
};

const pages: DocPageDefinition[] = [...GUIDE_PAGES, ...PROTOCOL_PAGES, ...DEVELOPER_PAGES, FAQ_PAGE];

export const DOC_PAGES = pages;

export function getDocPage(slug: string): DocPageDefinition | undefined {
  return pages.find((page) => page.slug === slug);
}

export function getAllDocSlugs(): string[] {
  return pages.map((page) => page.slug);
}

export function getDocSearchDocuments(): DocSearchDocument[] {
  return pages.map((page) => ({
    id: page.slug,
    slug: page.slug,
    title: page.title,
    description: page.description,
    tags: page.tags ?? [],
    body: [page.searchText, page.description, ...(page.tags ?? []), ...(page.keywords ?? [])]
      .filter(Boolean)
      .join(" "),
    section: getDocSectionTitle(page.slug),
  }));
}

export type { DocFrontmatter };
