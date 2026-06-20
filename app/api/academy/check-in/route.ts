import { NextRequest } from "next/server";

import { getRequestOrigin } from "@/lib/auth/utils";
import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";
import { AcademySeasonOutOfWindowError, AcademyTaskNotFoundError } from "@/lib/academy/tasks/errors";
import { getAcademyContext } from "../_shared";
import { getLatestChainTimestamp } from "@/lib/web3/server-chain-time";

export const runtime = "nodejs";

async function getAcademyCheckIn(request: NextRequest) {
  const { service, session } = await getAcademyContext(request);
  if (!session) {
    return createNoStoreErrorResponse("Authentication required.", 401, "ACADEMY_AUTH_REQUIRED");
  }

  if (!session.chainId) {
    return createNoStoreErrorResponse("Missing wallet chain context.", 400, "ACADEMY_CHAIN_REQUIRED");
  }

  const chainTimestampSeconds = await getLatestChainTimestamp(session.chainId);
  if (chainTimestampSeconds === null) {
    return createNoStoreErrorResponse(
      "Current chain time is unavailable.",
      503,
      "ACADEMY_CHAIN_TIME_UNAVAILABLE",
    );
  }

  try {
    const checkIn = await service.getCheckIn({
      userId: session.user.id,
      chainId: session.chainId,
      chainTimestampSeconds,
    });

    return createNoStoreJsonResponse(checkIn);
  } catch (error) {
    if (error instanceof AcademyTaskNotFoundError || error instanceof AcademySeasonOutOfWindowError) {
      return createNoStoreErrorResponse(error.message, error.status, error.code);
    }

    throw error;
  }
}

async function postAcademyCheckIn(request: NextRequest) {
  const { service, session } = await getAcademyContext(request);
  if (!session) {
    return createNoStoreErrorResponse("Authentication required.", 401, "ACADEMY_AUTH_REQUIRED");
  }

  if (!session.chainId) {
    return createNoStoreErrorResponse("Missing wallet chain context.", 400, "ACADEMY_CHAIN_REQUIRED");
  }

  const origin = getRequestOrigin(request);
  const chainTimestampSeconds = await getLatestChainTimestamp(session.chainId);
  if (chainTimestampSeconds === null) {
    return createNoStoreErrorResponse(
      "Current chain time is unavailable.",
      503,
      "ACADEMY_CHAIN_TIME_UNAVAILABLE",
    );
  }

  try {
    const checkIn = await service.checkIn({
      userId: session.user.id,
      chainId: session.chainId,
      chainTimestampSeconds,
    });
    const summary = await service.getSummary({
      userId: session.user.id,
      chainId: session.chainId,
      origin,
    });

    return createNoStoreJsonResponse(
      {
        summary,
        checkIn,
      },
      {
        status:
          checkIn.status === "cooldown" ? 429 : checkIn.status === "inactive" ? 403 : 200,
      },
    );
  } catch (error) {
    if (error instanceof AcademyTaskNotFoundError || error instanceof AcademySeasonOutOfWindowError) {
      return createNoStoreErrorResponse(error.message, error.status, error.code);
    }

    throw error;
  }
}

export const GET = withNoStoreRouteErrorHandling("academy/check-in:get", getAcademyCheckIn, {
  message: "Unable to load Academy check-in state.",
  status: 500,
  code: "ACADEMY_CHECKIN_FAILED",
});

export const POST = withNoStoreRouteErrorHandling("academy/check-in:post", postAcademyCheckIn, {
  message: "Unable to process Academy check-in.",
  status: 500,
  code: "ACADEMY_CHECKIN_FAILED",
});
