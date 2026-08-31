import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Droplets,
  Layers,
  Search,
  Shield,
  Terminal,
  Wallet,
} from "lucide-react";
import { DocsCard, DocsCardGrid } from "@/components/docs/docs-card";
import { Callout } from "@/components/docs/callout";
import { DocsContentFooter } from "@/components/docs/docs-content-footer";
import { DocsProse } from "@/components/docs/prose";
import { JsonLd } from "@/components/site/json-ld";
import { getBreadcrumbJsonLd, getWebPageJsonLd } from "@/lib/seo/json-ld";

export default function DocsHomePage() {
  const webPageJsonLd = getWebPageJsonLd({
    path: "/docs",
    title: "Documentation · Aurove Docs",
    description:
      "Aurove documentation — liquid claims on Mezo Earn positions, plus Swap, Liquidity, and integrator references.",
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ecd09b]/90">
            Aurove documentation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f6f3ef] sm:text-4xl">
            Liquid claims on Mezo Earn.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/60">
            Guides follow the production dApp. Protocol pages explain custody, wrapping, and
            rewards. Developer pages list the canonical Mezo deployment and integration paths.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/docs/guides/connect-wallet"
              className="inline-flex items-center gap-2 rounded-xl bg-[#d2a45f] px-4 py-2 text-sm font-medium text-[#20160b] transition hover:bg-[#ecd09b]"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/developers/deployment"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              <Terminal className="h-4 w-4" />
              Deployment reference
            </Link>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/40">
            <Search className="h-3.5 w-3.5" />
            Press{" "}
            <kbd className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>{" "}
            to search
          </p>
        </div>

        <DocsProse>
          <h2 className="!mt-0">Explore</h2>
        </DocsProse>
        <DocsCardGrid>
          <DocsCard
            title="Guides"
            description="Connect a wallet, swap, provide liquidity, create a position, claim, and redeem."
            href="/docs/guides/what-is-aurove"
            icon={<Wallet className="h-4 w-4" />}
          />
          <DocsCard
            title="Swap"
            description="Swap from the /swap interface, including deposit-and-wrap routes."
            href="/docs/guides/swap"
            icon={<Layers className="h-4 w-4" />}
          />
          <DocsCard
            title="Liquidity"
            description="Add concentrated liquidity to MUSD / avBTCm and avBTCm / avMEZOm."
            href="/docs/guides/liquidity"
            icon={<Droplets className="h-4 w-4" />}
          />
          <DocsCard
            title="Earn"
            description="Lock BTC or MEZO, or deposit an existing Mezo Earn NFT."
            href="/docs/guides/create-position"
            icon={<BookOpen className="h-4 w-4" />}
          />
          <DocsCard
            title="Academy"
            description="Points, tasks, leaderboard, and referrals after Sign In."
            href="/docs/guides/academy"
            icon={<Award className="h-4 w-4" />}
          />
          <DocsCard
            title="Protocol"
            description="Custody, assets, rewards, upgradeability, and limitations."
            href="/docs/protocol/overview"
            icon={<Shield className="h-4 w-4" />}
          />
        </DocsCardGrid>

        <DocsProse>
          <Callout variant="warning" title="Read production status before sending funds">
            Core and ID20 contracts are deployed. Managed deposits currently require each Aurove
            manager to hold a Mezo managed veNFT, and the two CL pools do not yet have Mezo gauges.
            Details are on <Link href="/docs/protocol/security">Security and limitations</Link>.
          </Callout>

          <h2>Start here</h2>
          <ol>
            <li>
              <Link href="/docs/guides/what-is-aurove">What is Aurove</Link>
            </li>
            <li>
              <Link href="/docs/guides/connect-wallet">Connect a wallet</Link>
            </li>
            <li>
              <Link href="/docs/guides/create-position">Create a liquid position</Link>
            </li>
            <li>
              <Link href="/docs/developers/deployment">Deployment reference</Link>
            </li>
          </ol>
        </DocsProse>
        <DocsContentFooter />
      </div>
    </div>
  );
}
