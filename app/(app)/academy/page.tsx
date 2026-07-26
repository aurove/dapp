import type { Metadata } from "next";
import { AcademyDashboard } from "@/components/features/academy/academy-dashboard";
import { createAcademyService } from "@/lib/academy/server";
import { getCurrentWalletAuthContextFromCookies } from "@/lib/auth/current";
import { getRequestOrigin } from "@/lib/auth/utils";
import type { AcademyLeaderboardEntry } from "@/lib/academy/types";
import { createPageMetadata } from "@/lib/seo/site";
import { cookies } from "next/headers";
import { headers } from "next/headers";

export const metadata: Metadata = createPageMetadata({
  title: "Academy Points & Leaderboard",
  description:
    "Earn Aurove Academy points as you swap, provide liquidity, and stay active. Track your score, referrals, and leaderboard rank across seasons.",
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
    <AcademyDashboard
      initialLeaderboard={initialLeaderboard}
      initialSummary={initialSummary}
      initialCurrentUserLeaderboardEntry={initialCurrentUserLeaderboardEntry}
    />
  );
}
