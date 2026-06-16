import { NextRequest, NextResponse } from "next/server";

import {
  getWalletAuthSessionWithUserByTokenHash,
  revokeWalletAuthSessionByTokenHash,
  rotateWalletAuthSessionToken,
} from "@/lib/auth/server";
import {
  createWalletAuthSessionCookieOptions,
  hashWalletAuthSessionToken,
  shouldRenewWalletAuthSession,
  WALLET_AUTH_SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { normalizeWalletAddress } from "@/lib/auth/utils";
import {
  createNoStoreJsonResponse,
  parsePositiveInteger,
} from "@/lib/server/http";

export const runtime = "nodejs";

function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: WALLET_AUTH_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(WALLET_AUTH_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const response = createNoStoreJsonResponse({
      authenticated: false,
      user: null,
      walletAddress: null,
      walletAddressNormalized: null,
      chainId: null,
      sessionExpiresAt: null,
      needsRenewal: false,
    });
    clearAuthCookie(response);
    return response;
  }

  const tokenHash = hashWalletAuthSessionToken(token);
  const result = await getWalletAuthSessionWithUserByTokenHash(tokenHash);
  if (!result) {
    const response = createNoStoreJsonResponse({
      authenticated: false,
      user: null,
      walletAddress: null,
      walletAddressNormalized: null,
      chainId: null,
      sessionExpiresAt: null,
      needsRenewal: false,
    });
    clearAuthCookie(response);
    return response;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress");
  const chainIdParam = request.nextUrl.searchParams.get("chainId");
  const chainId = parsePositiveInteger(chainIdParam);

  if (chainIdParam !== null && chainId === null) {
    return createNoStoreJsonResponse(
      {
        authenticated: false,
        user: null,
        walletAddress: null,
        walletAddressNormalized: null,
        chainId: null,
        sessionExpiresAt: null,
        needsRenewal: false,
      },
      { status: 400 },
    );
  }

  if (walletAddress) {
    let normalizedWalletAddress: string;
    try {
      normalizedWalletAddress = normalizeWalletAddress(walletAddress);
    } catch {
      return createNoStoreJsonResponse(
        {
          authenticated: false,
          user: null,
          walletAddress: null,
          walletAddressNormalized: null,
          chainId: null,
          sessionExpiresAt: null,
          needsRenewal: false,
        },
        { status: 400 },
      );
    }

    if (normalizedWalletAddress !== result.user.walletAddressNormalized) {
      await revokeWalletAuthSessionByTokenHash(tokenHash);
      const response = createNoStoreJsonResponse({
        authenticated: false,
        user: null,
        walletAddress: null,
        walletAddressNormalized: null,
        chainId: null,
        sessionExpiresAt: null,
        needsRenewal: false,
      });
      clearAuthCookie(response);
      return response;
    }
  }

  if (chainId && chainId !== result.session.chainId) {
    await revokeWalletAuthSessionByTokenHash(tokenHash);
    const response = createNoStoreJsonResponse({
      authenticated: false,
      user: null,
      walletAddress: null,
      walletAddressNormalized: null,
      chainId: null,
      sessionExpiresAt: null,
      needsRenewal: false,
    });
    clearAuthCookie(response);
    return response;
  }

  let needsRenewal = shouldRenewWalletAuthSession(result.session.expiresAt);
  let responseToken = token;
  let session = result.session;

  if (needsRenewal) {
    const rotated = await rotateWalletAuthSessionToken(tokenHash);
    if (rotated) {
      responseToken = rotated.token;
      session = rotated.session;
      needsRenewal = false;
    }
  }

  const response = createNoStoreJsonResponse(
    {
      authenticated: true,
      user: result.user,
      walletAddress: result.user.walletAddress,
      walletAddressNormalized: result.user.walletAddressNormalized,
      chainId: session.chainId,
      sessionExpiresAt: session.expiresAt,
      needsRenewal,
    },
  );

  response.cookies.set({
    ...createWalletAuthSessionCookieOptions(new Date(session.expiresAt)),
    value: responseToken,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(WALLET_AUTH_SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeWalletAuthSessionByTokenHash(hashWalletAuthSessionToken(token));
  }

  const response = createNoStoreJsonResponse({ ok: true });
  clearAuthCookie(response);
  return response;
}
