import { NextRequest } from "next/server";

import { getRequestOrigin } from "@/lib/auth/utils";
import { createNoStoreErrorResponse, createNoStoreJsonResponse } from "@/lib/server/http";
import { AcademyTaskNotFoundError } from "@/lib/academy/tasks/errors";
import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { service, session } = await getAcademyContext(request);
    if (!session) {
      return createNoStoreErrorResponse("Authentication required.", 401, "ACADEMY_AUTH_REQUIRED");
    }

    if (!session.chainId) {
      return createNoStoreErrorResponse("Missing wallet chain context.", 400, "ACADEMY_CHAIN_REQUIRED");
    }

    const checkIn = await service.getCheckIn({
      userId: session.user.id,
      chainId: session.chainId,
    });

    return createNoStoreJsonResponse(checkIn);
  } catch (error) {
    if (error instanceof AcademyTaskNotFoundError) {
      return createNoStoreErrorResponse(error.message, error.status, error.code);
    }

    const message = error instanceof Error ? error.message : "Unable to load Academy check-in state.";
    return createNoStoreErrorResponse(message, 500, "ACADEMY_CHECKIN_FAILED");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service, session } = await getAcademyContext(request);
    if (!session) {
      return createNoStoreErrorResponse("Authentication required.", 401, "ACADEMY_AUTH_REQUIRED");
    }

    if (!session.chainId) {
      return createNoStoreErrorResponse("Missing wallet chain context.", 400, "ACADEMY_CHAIN_REQUIRED");
    }

    const checkIn = await service.checkIn({
      userId: session.user.id,
      chainId: session.chainId,
    });
    const summary = await service.getSummary({
      userId: session.user.id,
      chainId: session.chainId,
      origin: getRequestOrigin(request),
    });

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
