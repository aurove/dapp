import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Droplets,
  Layers,
  Search,
  Shield,
  Terminal,
} from "lucide-react";
import { DocsCard, DocsCardGrid } from "@/components/docs/docs-card";
import { Callout } from "@/components/docs/callout";
import { DocsContentFooter } from "@/components/docs/docs-content-footer";
import { DocsProse } from "@/components/docs/prose";
import { StatusBadge } from "@/components/docs/status-badge";
import { JsonLd } from "@/components/site/json-ld";
import { getBreadcrumbJsonLd, getWebPageJsonLd } from "@/lib/seo/json-ld";

export default function DocsHomePage() {
  const webPageJsonLd = getWebPageJsonLd({
    path: "/docs",
    title: "Documentation · Aurove Docs",
    description:
      "Aurove Protocol Documentation — learn how Aurove transforms locked veBTC and veMEZO positions into liquid yield assets on Mezo.",
  });
  const breadcrumbJsonLd = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Docs", path: "/docs" },
  ]);

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
    <JsonLd data={webPageJsonLd} />
    <JsonLd data={breadcrumbJsonLd} />
    <div className="mx-auto max-w-3xl pb-4">
      <div className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-b from-[#d2a45f]/10 via-white/[0.02] to-transparent px-6 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ecd09b]/90">
            Aurove Protocol Documentation
          </p>
          <StatusBadge status="live" />
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f6f3ef] sm:text-4xl">
          Liquid ve-yield on Mezo.
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/60">
          Learn how Aurove transforms locked veBTC and veMEZO positions into liquid yield assets.
          Guides cover Earn, Swap, Liquidity, Academy, and the contracts that power them — only
          features that exist today.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/docs/getting-started/connect-wallet"
            className="inline-flex items-center gap-2 rounded-xl bg-[#d2a45f] px-4 py-2 text-sm font-medium text-[#20160b] transition hover:bg-[#ecd09b]"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/docs/developers/contracts"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            <Terminal className="h-4 w-4" />
            Contracts
          </Link>
        </div>
        <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/40">
          <Search className="h-3.5 w-3.5" />
          Press <kbd className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 font-mono">⌘K</kbd>{" "}
          to search
        </p>
      </div>

      <DocsProse>
        <h2 className="!mt-0">Explore by product</h2>
      </DocsProse>
      <DocsCardGrid>
        <DocsCard
          title="Swap"
          description="Swap liquid Aurove assets and veNFTs through Mezo concentrated-liquidity routes."
          href="/docs/swap/overview"
          status="live"
          icon={<Layers className="h-4 w-4" />}
        />
        <DocsCard
          title="Earn"
          description="Turn locked Bitcoin and MEZO voting power into liquid yield assets."
          href="/docs/earn/managed-yield"
          status="live"
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <DocsCard
          title="Liquidity"
          description="Provide concentrated liquidity, collect fees, manage position NFTs."
          href="/docs/liquidity/providing-liquidity"
          status="live"
          icon={<Droplets className="h-4 w-4" />}
        />
        <DocsCard
          title="Academy"
          description="Points, tasks, leaderboard, and referrals after wallet authentication."
          href="/docs/academy/points"
          status="live"
          icon={<Award className="h-4 w-4" />}
        />
        <DocsCard
          title="Protocol"
          description="ID20, Ledger, Vaults, rewards, and the security model."
          href="/docs/protocol/id20"
          status="live"
          icon={<Shield className="h-4 w-4" />}
        />
        <DocsCard
          title="Developers"
          description="Contract references, events, APIs, and integration notes."
          href="/docs/developers/contracts"
          status="live"
          icon={<BookOpen className="h-4 w-4" />}
        />
      </DocsCardGrid>

      <DocsProse>
        <Callout variant="info" title="Scope">
          Documentation is limited to implemented dapp routes and deployed testnet contracts. Status
          badges separate <strong>Live on Testnet</strong>, <strong>In Development</strong>, and{" "}
          <strong>Planned</strong> items. Future roadmap features are not invented here.
        </Callout>

        <h2>Start here</h2>
        <ol>
          <li>
            <Link href="/docs/introduction/what-is-aurove">What is Aurove</Link>
          </li>
          <li>
            <Link href="/docs/getting-started/connect-wallet">Connect wallet</Link>
          </li>
          <li>
            <Link href="/docs/getting-started/first-transaction">First transaction (swap &amp; veNFTs)</Link>
          </li>
          <li>
            <Link href="/docs/swap/overview">Swap overview</Link>
          </li>
        </ol>
      </DocsProse>
      <DocsContentFooter />
    </div>
    </div>
  );
}
