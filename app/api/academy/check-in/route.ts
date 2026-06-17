import { NextRequest } from "next/server";

import { createNoStoreErrorResponse, createNoStoreJsonResponse } from "@/lib/server/http";
import { AcademyTaskNotFoundError } from "@/lib/academy/tasks/errors";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { service, session } = await getAcademyContext(request);
    if (!session) {
      return createNoStoreErrorResponse("Authentication required.", 401, "ACADEMY_AUTH_REQUIRED");
    }

    const checkIn = await service.checkIn(session.user.id);
    const summary = await service.getSummary(session.user.id);

    return createNoStoreJsonResponse(
      {
        summary,
        checkIn,
      },
      { status: checkIn.status === "cooldown" ? 429 : 200 },
    );
  } catch (error) {
    if (error instanceof AcademyTaskNotFoundError) {
      return createNoStoreErrorResponse(error.message, error.status, error.code);
    }

    const message = error instanceof Error ? error.message : "Unable to process Academy check-in.";
    return createNoStoreErrorResponse(message, 500, "ACADEMY_CHECKIN_FAILED");
  }
}
