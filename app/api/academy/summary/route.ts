import { NextRequest } from "next/server";

import { getRequestOrigin } from "@/lib/auth/utils";
import { createNoStoreJsonResponse, withNoStoreRouteErrorHandling } from "@/lib/server/http";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

async function getAcademySummary(request: NextRequest) {
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
