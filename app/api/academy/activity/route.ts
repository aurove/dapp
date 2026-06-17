import { NextRequest } from "next/server";

import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  parsePositiveInteger,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";
import { AcademyActivityUserNotFoundError } from "@/lib/academy/tasks/errors";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

async function getAcademyActivity(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return createNoStoreErrorResponse("Missing Academy user.", 400, "ACADEMY_ACTIVITY_USER_REQUIRED");
  }

  const seasonId = request.nextUrl.searchParams.get("seasonId");
  const page = parsePositiveInteger(request.nextUrl.searchParams.get("page")) ?? 1;
  const limit = parsePositiveInteger(request.nextUrl.searchParams.get("limit")) ?? 8;

  const { service, session } = await getAcademyContext(request);

  try {
    const activity = await service.getActivity(
      {
        walletAddress: address,
        seasonId,
        page,
        limit,
      },
      session?.user.id ?? null,
    );

    return createNoStoreJsonResponse(activity);
  } catch (error) {
    if (error instanceof AcademyActivityUserNotFoundError) {
      return createNoStoreErrorResponse(error.message, error.status, error.code);
    }

    throw error;
  }
}

export const GET = withNoStoreRouteErrorHandling("academy/activity", getAcademyActivity, {
  message: "Unable to load Academy activity.",
  status: 500,
  code: "ACADEMY_ACTIVITY_FAILED",
});
