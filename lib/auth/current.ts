import { hashWalletAuthSessionToken, WALLET_AUTH_SESSION_COOKIE_NAME } from "./session";
import { getWalletAuthSessionWithUserByTokenHash } from "./server";
import type { WalletAuthSession, WalletAuthUser } from "./types";

type CookieAccessor = {
  get(name: string): { value: string } | undefined;
};

export type CurrentWalletAuthContext = {
  user: WalletAuthUser;
  session: WalletAuthSession;
  walletAddress: string;
  walletAddressNormalized: string;
  chainId: number;
  sessionExpiresAt: string;
};

export async function getCurrentWalletAuthContextFromCookies(
  cookies: CookieAccessor,
): Promise<CurrentWalletAuthContext | null> {
  const token = cookies.get(WALLET_AUTH_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const result = await getWalletAuthSessionWithUserByTokenHash(hashWalletAuthSessionToken(token));
  if (!result) {
    return null;
  }

  return {
    user: result.user,
    session: result.session,
    walletAddress: result.user.walletAddress,
    walletAddressNormalized: result.user.walletAddressNormalized,
    chainId: result.session.chainId,
    sessionExpiresAt: result.session.expiresAt,
  };
}
