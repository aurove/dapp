import type { Metadata } from "next";
import { AcademyDashboard } from "@/components/features/academy/academy-dashboard";
import { ProductSeo } from "@/components/site/product-seo";
import { createAcademyService } from "@/lib/academy/server";
import { getCurrentWalletAuthContextFromCookies } from "@/lib/auth/current";
import { getRequestOrigin } from "@/lib/auth/utils";
import type { AcademyLeaderboardEntry } from "@/lib/academy/types";
import { createPageMetadata } from "@/lib/seo/site";
import { cookies } from "next/headers";
import { headers } from "next/headers";

const TITLE = "Academy Points & Leaderboard";
const DESCRIPTION =
  "Earn Aurove Academy points as you swap, provide liquidity, and stay active. Track your score, referrals, and leaderboard rank across seasons.";

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/academy",
  keywords: [
    "Aurove Academy",
    "Mezo Earn",
    "points",
    "leaderboard",
    "referrals",
    "Bitcoin DeFi",
  ],
});

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type AcademyPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AcademyPage({ searchParams }: AcademyPageProps) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const session = await getCurrentWalletAuthContextFromCookies(cookieStore);
  const service = createAcademyService();
  const origin = getRequestOrigin({ headers: headerStore });
  const leaderboardPage = parsePositiveInteger(getSearchParam(searchParams, "leaderboardPage")) ?? 1;
  const leaderboardEpoch = parsePositiveInteger(getSearchParam(searchParams, "epoch"));
  const initialSummary = session
    ? await service.getSummary({
        userId: session.user.id,
        chainId: session.chainId,
        origin,
      })
    : null;
  const initialLeaderboard = await service.getLeaderboard({
    page: leaderboardPage,
    limit: 10,
    epoch: leaderboardEpoch,
    userId: session?.user.id ?? null,
    chainId: session?.chainId ?? null,
  });
  const initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null =
    initialLeaderboard.items.find((entry) => entry.isCurrentUser) ?? null;

  return (
    <div className="space-y-6">
      <ProductSeo
        path="/academy"
        title={TITLE}
        description={DESCRIPTION}
        bullets={[
          "Earn task points from qualifying swaps and liquidity fee collection.",
          "Track season score, rank, and leaderboard after wallet Sign In.",
          "Share a referral link so new users can join your Academy network.",
          "Learn Mezo Earn concepts while staying active across Aurove.",
        ]}
        relatedLinks={[
          { href: "/docs/academy/points", label: "Points docs" },
          { href: "/docs/academy/quests", label: "Quests & tasks" },
          { href: "/docs/academy/referrals", label: "Referrals" },
          { href: "/#swap-interface", label: "Open Swap" },
        ]}
      />
      <AcademyDashboard
        initialLeaderboard={initialLeaderboard}
        initialSummary={initialSummary}
        initialCurrentUserLeaderboardEntry={initialCurrentUserLeaderboardEntry}
      />
    </div>
  );
}
