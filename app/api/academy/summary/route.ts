import { NextRequest } from "next/server";

import { getRequestOrigin } from "@/lib/auth/utils";
import { createNoStoreErrorResponse, createNoStoreJsonResponse, withNoStoreRouteErrorHandling } from "@/lib/server/http";
import { ACADEMY_DISABLED_CODE, ACADEMY_DISABLED_MESSAGE, ACADEMY_ENABLED } from "@/lib/academy/availability";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

async function getAcademySummary(request: NextRequest) {
  if (!ACADEMY_ENABLED) {
    return createNoStoreErrorResponse(ACADEMY_DISABLED_MESSAGE, 404, ACADEMY_DISABLED_CODE);
  }

  const { service, session } = await getAcademyContext(request);
  const summary = await service.getSummary({
    userId: session?.user.id ?? null,
    chainId: session?.chainId ?? null,
    origin: getRequestOrigin(request),
  });
  return createNoStoreJsonResponse(summary);
}

export const GET = withNoStoreRouteErrorHandling("academy/summary", getAcademySummary, {
  message: "Unable to load Academy summary.",
  status: 500,
  code: "ACADEMY_SUMMARY_FAILED",
});
