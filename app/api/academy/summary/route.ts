import { NextRequest } from "next/server";

import { createNoStoreErrorResponse, createNoStoreJsonResponse } from "@/lib/server/http";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { service, session } = await getAcademyContext(request);
    const summary = await service.getSummary(session?.user.id ?? null);
    return createNoStoreJsonResponse(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Academy summary.";
    return createNoStoreErrorResponse(message, 500, "ACADEMY_SUMMARY_FAILED");
  }
}
