import { NextRequest } from "next/server";

import {
  getOrCreateWalletAuthChallenge,
  formatWalletAuthChallengeMessage,
} from "@/lib/auth/server";
import { consumeAuthNonceRateLimit } from "@/lib/auth/rate-limit";
import { formatWalletAddress, getRequestOrigin, normalizeWalletAddress } from "@/lib/auth/utils";
import {
  createNoStoreErrorResponse,
  createNoStoreJsonResponse,
  getClientKey,
  withNoStoreRouteErrorHandling,
} from "@/lib/server/http";

export const runtime = "nodejs";

async function postAuthNonce(request: NextRequest) {
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

  if (!walletAddress) {
    return createNoStoreErrorResponse("walletAddress is required.", 400, "BAD_REQUEST");
  }

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return createNoStoreErrorResponse("chainId must be a positive integer.", 400, "BAD_REQUEST");
  }

  let normalizedWalletAddress: string;
  try {
    normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  } catch {
    return createNoStoreJsonResponse(
      {
        error: "walletAddress is not a valid Ethereum address.",
        code: "INVALID_ADDRESS",
      },
      { status: 400 },
    );
  }

  const rateCheck = consumeAuthNonceRateLimit(
    `${getClientKey(request)}:${normalizedWalletAddress}`,
    Date.now(),
  );

  if (!rateCheck.allowed) {
    return createNoStoreJsonResponse(
      { error: "Too many challenge requests.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "retry-after": String(rateCheck.retryAfterSeconds),
        },
      },
    );
  }

  const origin = getRequestOrigin(request);
  const challenge = await getOrCreateWalletAuthChallenge({
    walletAddressNormalized: normalizedWalletAddress,
    chainId,
  });

  const message = formatWalletAuthChallengeMessage(challenge, origin, walletAddress);

  return createNoStoreJsonResponse(
    {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      message,
      walletAddress: formatWalletAddress(walletAddress),
      walletAddressNormalized: normalizedWalletAddress,
      chainId,
      expiresAt: challenge.expiresAt,
    },
  );
}

export const POST = withNoStoreRouteErrorHandling("auth/nonce", postAuthNonce, {
  message: "Unable to create an authentication challenge.",
  status: 500,
  code: "AUTH_NONCE_FAILED",
});
