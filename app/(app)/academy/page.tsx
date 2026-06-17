import { AcademyDashboard } from "@/components/features/academy/academy-dashboard";
import { createAcademyService } from "@/lib/academy/server";
import { getCurrentWalletAuthContextFromCookies } from "@/lib/auth/current";
import { getRequestOrigin } from "@/lib/auth/utils";
import type { AcademyLeaderboardEntry } from "@/lib/academy/types";
import { cookies } from "next/headers";
import { headers } from "next/headers";

export default async function AcademyPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const session = await getCurrentWalletAuthContextFromCookies(cookieStore);
  const service = createAcademyService();
  const origin = getRequestOrigin({ headers: headerStore });
  const initialSummary = session
    ? await service.getSummary({
        userId: session.user.id,
        chainId: session.chainId,
        origin,
      })
    : null;
  const initialCurrentUserLeaderboardEntry: AcademyLeaderboardEntry | null =
    session && initialSummary?.rank
      ? {
          userId: session.user.id,
          rank: initialSummary.rank,
          walletAddress: session.user.walletAddress,
          totalPoints: initialSummary.totalPoints,
          entryCount: 0,
          isCurrentUser: true,
        }
      : null;
  const initialLeaderboard = await service.getLeaderboard(1, 10, null);

  return (
    <AcademyDashboard
      initialLeaderboard={initialLeaderboard}
      initialSummary={initialSummary}
      initialCurrentUserLeaderboardEntry={initialCurrentUserLeaderboardEntry}
    />
  );
}
