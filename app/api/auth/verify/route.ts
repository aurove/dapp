import { NextRequest } from "next/server";

import {
  createWalletAuthSessionCookieOptions,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  verifyWalletAuthSignature,
} from "@/lib/auth/server";
import {
  bindAcademyReferral,
  createClearedAcademyReferralPendingCookie,
  parseReferralPendingCookie,
} from "@/lib/academy/referrals";
import { getRequestOrigin } from "@/lib/auth/utils";
import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";

export const runtime = "nodejs";

const SAFE_AUTH_ERROR_STATUSES = new Map<string, number>([
  ["Invalid authentication message.", 400],
  ["Wallet address does not match the signed message.", 401],
  ["Chain ID does not match the signed message.", 401],
  ["Authentication message origin does not match this app.", 401],
  ["Challenge not found or already used.", 401],
  ["Challenge has expired.", 410],
  ["Authentication message does not match the stored challenge.", 401],
  ["Signature verification failed.", 401],
]);

async function postAuthVerify(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return createNoStoreErrorResponse("Invalid JSON payload.");
  }

  const walletAddress = typeof (payload as { walletAddress?: unknown }).walletAddress === "string"
    ? (payload as { walletAddress: string }).walletAddress.trim()
    : "";
  const chainIdRaw = (payload as { chainId?: unknown }).chainId;
  const chainId = typeof chainIdRaw === "number" ? chainIdRaw : Number(chainIdRaw);
  const message = typeof (payload as { message?: unknown }).message === "string"
    ? (payload as { message: string }).message
    : "";
  const signature = typeof (payload as { signature?: unknown }).signature === "string"
    ? (payload as { signature: `0x${string}` }).signature
    : "";

  if (!walletAddress) {
    return createNoStoreErrorResponse("walletAddress is required.", 400, "BAD_REQUEST");
  }

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return createNoStoreErrorResponse("chainId must be a positive integer.", 400, "BAD_REQUEST");
  }

  if (!message) {
    return createNoStoreErrorResponse("message is required.", 400, "BAD_REQUEST");
  }

  if (!signature.startsWith("0x")) {
    return createNoStoreErrorResponse("signature is required.", 400, "BAD_REQUEST");
  }

  const origin = getRequestOrigin(request);

  try {
    const result = await verifyWalletAuthSignature({
      walletAddress,
      chainId,
      message,
      signature: signature as `0x${string}`,
      origin,
    });

    const response = createNoStoreJsonResponse(
      {
        user: result.user,
        session: result.session,
      },
    );

    response.cookies.set({
      ...createWalletAuthSessionCookieOptions(new Date(result.session.expiresAt)),
      value: result.token,
    });

    const pendingReferral = parseReferralPendingCookie(
      request.cookies.get("academy_referral")?.value ?? null,
    );
    if (pendingReferral) {
      try {
        await bindAcademyReferral(db, {
          referredUserId: result.user.id,
          chainId: result.session.chainId,
          refId: pendingReferral.refId,
        });
      } catch {
        // Referral binding should never block authentication.
      }
    }

    response.cookies.set(createClearedAcademyReferralPendingCookie());

    return response;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : null;
    if (messageText && SAFE_AUTH_ERROR_STATUSES.has(messageText)) {
      return createNoStoreErrorResponse(
        messageText,
        SAFE_AUTH_ERROR_STATUSES.get(messageText) ?? 400,
        "AUTH_FAILED",
      );
    }

    throw error;
  }
}

export const POST = withNoStoreRouteErrorHandling("auth/verify", postAuthVerify, {
  message: "Unable to verify wallet signature.",
  status: 500,
  code: "AUTH_FAILED",
});
