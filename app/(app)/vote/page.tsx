import { Suspense } from "react";
import Link from "next/link";
import { VotePage } from "@/components/features/vote/vote-page";
import type { VoteData } from "@/components/features/vote/vote-data";
import { JsonLd } from "@/components/site/json-ld";
import { getWebPageJsonLd } from "@/lib/seo/json-ld";
import { createPageMetadata } from "@/lib/seo/site";
import { getActiveChain } from "@/lib/config/chains";
import { getVoteSnapshot } from "@/lib/vote/server-snapshot";

const title = "veBTC Gauge Voting on Mezo";
const description =
  "Compare voter rewards for Aurove liquidity pools on Mezo. Use your veBTC voting power to choose pools and review your allocation before voting.";
export const metadata = createPageMetadata({
  title,
  description,
  path: "/vote",
  keywords: ["veBTC voting", "Mezo gauge voting", "Aurove pools", "voter rewards"],
});

async function VotingPools() {
  const chain = getActiveChain();
  let snapshot: { data: VoteData; updatedAt: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Public, exact-network data only. Wallet state is read on the client.
    // Stream the introduction immediately and cap RPC latency before client retry.
    snapshot = await Promise.race([
      getVoteSnapshot(chain.id),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 20000);
      }),
    ]);
  } catch {
    // A temporary RPC failure must not take down the public page.
  } finally {
    if (timer) clearTimeout(timer);
  }
  return (
    <VotePage
      initialData={snapshot?.data}
      initialChainId={chain.id}
      initialUpdatedAt={snapshot?.updatedAt}
    />
  );
}

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <JsonLd data={getWebPageJsonLd({ path: "/vote", title, description })} />
      <header>
        <h1 className="text-3xl font-semibold">Vote</h1>
        <p className="mt-2 max-w-xl text-white/60">
          Explore voter rewards and choose where your veBTC votes go.
        </p>
      </header>
      <Suspense
        fallback={
          <p role="status" className="py-8 text-white/50">
            Loading pools…
          </p>
        }
      >
        <VotingPools />
      </Suspense>
      <nav aria-label="Learn more" className="flex gap-5 text-sm text-white/50">
        <Link href="/liquidity" className="hover:text-white">
          Explore liquidity pools
        </Link>
        <Link href="/earn" className="hover:text-white">
          Learn about veBTC
        </Link>
      </nav>
    </div>
  );
}
