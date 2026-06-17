import { NextRequest } from "next/server";

import { getRequestOrigin } from "@/lib/auth/utils";
import { db } from "@/lib/db";
import {
  bindAcademyReferral,
  clearAcademyReferralPendingCookieOptions,
  createAcademyReferralPendingCookie,
  resolveAcademyReferralSummary,
  isValidAcademyReferralId,
} from "@/lib/academy/referrals";
import { AcademyReferralAlreadyBoundError, AcademyReferralError, AcademyReferralNotFoundError } from "@/lib/academy/tasks/errors";
import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";

import { getAcademyContext } from "../_shared";

export const runtime = "nodejs";

async function postAcademyReferral(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return createNoStoreErrorResponse("Invalid JSON payload.", 400, "BAD_REQUEST");
  }

  const refId = typeof (payload as { refId?: unknown }).refId === "string"
    ? (payload as { refId: string }).refId.trim()
    : "";

  if (!isValidAcademyReferralId(refId)) {
    return createNoStoreErrorResponse("Referral code is invalid.", 400, "ACADEMY_REFERRAL_INVALID");
  }

  const { session } = await getAcademyContext(request);
  const origin = getRequestOrigin(request);

  if (session?.user.id && session.chainId) {
    try {
      await bindAcademyReferral(db, {
        referredUserId: session.user.id,
        chainId: session.chainId,
        refId,
      });
    } catch (error) {
      if (
        error instanceof AcademyReferralAlreadyBoundError ||
        error instanceof AcademyReferralError ||
        error instanceof AcademyReferralNotFoundError
      ) {
        return createNoStoreErrorResponse(error.message, error.status, error.code);
      }

      throw error;
    }

    const referral = await resolveAcademyReferralSummary(db, {
      userId: session.user.id,
      chainId: session.chainId,
      origin,
    });

    const response = createNoStoreJsonResponse({
      status: "bound" as const,
      referral,
    });
    response.cookies.set(clearAcademyReferralPendingCookieOptions());

    return response;
  }

  const response = createNoStoreJsonResponse({
    status: "pending" as const,
    referral: null,
  });

  response.cookies.set(createAcademyReferralPendingCookie({ refId }));

  return response;
}

export const POST = withNoStoreRouteErrorHandling("academy/referral", postAcademyReferral, {
  message: "Unable to process Academy referral.",
  status: 500,
  code: "ACADEMY_REFERRAL_FAILED",
});
