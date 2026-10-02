import { NextRequest } from "next/server";

import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  parsePositiveInteger,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";
import { ACADEMY_DISABLED_CODE, ACADEMY_DISABLED_MESSAGE, ACADEMY_ENABLED } from "@/lib/academy/availability";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

async function getAcademyLeaderboard(request: NextRequest) {
  if (!ACADEMY_ENABLED) {
    return createNoStoreErrorResponse(ACADEMY_DISABLED_MESSAGE, 404, ACADEMY_DISABLED_CODE);
  }

  const page = parsePositiveInteger(request.nextUrl.searchParams.get("page")) ?? 1;
  const limit = parsePositiveInteger(request.nextUrl.searchParams.get("limit")) ?? 10;
  const epoch = parsePositiveInteger(request.nextUrl.searchParams.get("epoch"));
  const { service, session } = await getAcademyContext(request);
  const leaderboard = await service.getLeaderboard({
    page,
    limit,
    epoch,
    userId: session?.user.id ?? null,
    chainId: session?.chainId ?? null,
  });
  return createNoStoreJsonResponse(leaderboard);
}

export const GET = withNoStoreRouteErrorHandling("academy/leaderboard", getAcademyLeaderboard, {
  message: "Unable to load Academy leaderboard.",
  status: 500,
  code: "ACADEMY_LEADERBOARD_FAILED",
});
