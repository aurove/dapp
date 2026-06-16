export type WalletAuthUser = {
  id: string;
  walletAddress: string;
  walletAddressNormalized: string;
  chainId: number | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletAuthSession = {
  id: string;
  userId: string;
  walletAddressNormalized: string;
  chainId: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type WalletAuthChallenge = {
  id: string;
  walletAddressNormalized: string;
  chainId: number;
  nonce: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type WalletAuthState = {
  user: WalletAuthUser | null;
  walletAddress: string | null;
  walletAddressNormalized: string | null;
  chainId: number | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
};

export type WalletAuthChallengeResponse = {
  challengeId: string;
  nonce: string;
  message: string;
  walletAddress: string;
  walletAddressNormalized: string;
  chainId: number;
  expiresAt: string;
};

export type WalletAuthVerifyResponse = {
  user: WalletAuthUser;
  session: WalletAuthSession;
};

export type WalletAuthSessionResponse = {
  authenticated: boolean;
  user: WalletAuthUser | null;
  walletAddress: string | null;
  walletAddressNormalized: string | null;
  chainId: number | null;
  sessionExpiresAt: string | null;
  needsRenewal: boolean;
};
