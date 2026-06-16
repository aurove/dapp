import { NextRequest } from "next/server";

import {
  createWalletAuthSessionCookieOptions,
} from "@/lib/auth/session";
import {
  verifyWalletAuthSignature,
} from "@/lib/auth/server";
import { getRequestOrigin } from "@/lib/auth/utils";
import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
} from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

    return response;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unable to verify wallet signature.";
    const status = /expired/i.test(messageText) ? 410 : /signature|wallet|message|challenge/i.test(messageText) ? 401 : 400;
    return createNoStoreErrorResponse(messageText, status, "AUTH_FAILED");
  }
}
