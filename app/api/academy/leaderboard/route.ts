import { NextRequest } from "next/server";

import { createNoStoreErrorResponse, createNoStoreJsonResponse, parsePositiveInteger } from "@/lib/server/http";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const page = parsePositiveInteger(request.nextUrl.searchParams.get("page")) ?? 1;
    const limit = parsePositiveInteger(request.nextUrl.searchParams.get("limit")) ?? 10;
    const { service, session } = await getAcademyContext(request);
    const leaderboard = await service.getLeaderboard(page, limit, session?.user.id ?? null);
    return createNoStoreJsonResponse(leaderboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Academy leaderboard.";
    return createNoStoreErrorResponse(message, 500, "ACADEMY_LEADERBOARD_FAILED");
  }
}
