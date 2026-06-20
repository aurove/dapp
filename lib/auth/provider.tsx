"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";

import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  fetchWalletAuthSession,
  logoutWalletAuthSession,
  requestWalletAuthChallenge,
  verifyWalletAuthSignature,
} from "./api";
import { normalizeWalletAddress, shortenWalletAddress } from "./utils";
import type { WalletAuthSessionResponse, WalletAuthUser } from "./types";
import {
  notifyWalletAuthError,
  notifyWalletAuthInfo,
  notifyWalletAuthSuccess,
} from "@/lib/notifications";

type WalletAuthContextValue = {
  user: WalletAuthUser | null;
  walletAddress: string | null;
  walletAddressNormalized: string | null;
  chainId: number | null;
  sessionExpiresAt: string | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  loginWithWallet: (options?: { force?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: (options?: { notifyOnError?: boolean }) => Promise<WalletAuthSessionResponse | null>;
  walletLabel: string | null;
};

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

function isUserRejectedSignature(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 4001 || code === "ACTION_REJECTED") {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rejected|denied|user rejected|cancelled/i.test(message);
}

function getFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unable to authenticate wallet.";
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [user, setUser] = useState<WalletAuthUser | null>(null);
  const [sessionWalletAddressNormalized, setSessionWalletAddressNormalized] = useState<string | null>(
    null,
  );
  const [sessionChainId, setSessionChainId] = useState<number | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const inFlightRef = useRef(false);
  const autoSignInAttemptedWalletKeyRef = useRef<string | null>(null);
  const suppressedWalletKeyRef = useRef<string | null>(null);

  const walletAddress = address ?? null;
  const walletAddressNormalized = useMemo(
    () => (walletAddress ? normalizeWalletAddress(walletAddress) : null),
    [walletAddress],
  );
  const expectedChain = useMemo(() => getActiveChain(resolveAppEnvironment()), []);
  const walletLabel = walletAddress ? shortenWalletAddress(walletAddress) : null;
  const walletKey = walletAddressNormalized && chainId ? `${walletAddressNormalized}:${chainId}` : null;
  const isOnExpectedChain = chainId === expectedChain.id;

  const isAuthenticated =
    Boolean(user) &&
    walletAddressNormalized !== null &&
    sessionWalletAddressNormalized === walletAddressNormalized &&
    sessionChainId === chainId;

  const clearLocalAuthState = useCallback(() => {
    setUser(null);
    setSessionWalletAddressNormalized(null);
    setSessionChainId(null);
    setSessionExpiresAt(null);
  }, []);

  const refreshSession = useCallback(
    async (options?: { notifyOnError?: boolean }): Promise<WalletAuthSessionResponse | null> => {
      if (!isConnected || !walletAddress || !chainId) {
        return null;
      }

      try {
        const session = await fetchWalletAuthSession({
          walletAddress,
          chainId,
        });

        if (!session.authenticated || !session.user) {
          clearLocalAuthState();
          return session;
        }

        setUser(session.user);
        setSessionWalletAddressNormalized(session.walletAddressNormalized);
        setSessionChainId(session.chainId);
        setSessionExpiresAt(session.sessionExpiresAt);
        suppressedWalletKeyRef.current = null;

        return session;
      } catch (error) {
        if (options?.notifyOnError) {
          notifyWalletAuthError("Wallet session unavailable", getFriendlyError(error));
        }
        throw error;
      }
    },
    [chainId, clearLocalAuthState, isConnected, walletAddress],
  );

  const loginWithWallet = useCallback(async (options?: { force?: boolean }) => {
    if (inFlightRef.current) {
      return;
    }

    if (!walletAddress || !chainId || !walletKey) {
      notifyWalletAuthInfo("Connect your wallet", "Connect a wallet before signing in.");
      return;
    }

    autoSignInAttemptedWalletKeyRef.current = walletKey;

    if (!options?.force && suppressedWalletKeyRef.current === walletKey) {
      try {
        await refreshSession({ notifyOnError: true });
      } catch (error) {
        notifyWalletAuthError("Wallet sign-in failed", getFriendlyError(error));
      }
      return;
    }

    inFlightRef.current = true;
    setIsAuthenticating(true);

    try {
      const session = await refreshSession();
      if (session?.authenticated && session.user) {
        suppressedWalletKeyRef.current = null;
        return;
      }

      const challenge = await requestWalletAuthChallenge({
        walletAddress,
        chainId,
      });

      const signature = await signMessageAsync({ message: challenge.message });
      const result = await verifyWalletAuthSignature({
        walletAddress,
        chainId,
        message: challenge.message,
        signature,
      });

      setUser(result.user);
      setSessionWalletAddressNormalized(result.user.walletAddressNormalized);
      setSessionChainId(result.session.chainId);
      setSessionExpiresAt(result.session.expiresAt);
      suppressedWalletKeyRef.current = null;
      notifyWalletAuthSuccess(
        "Wallet signed in",
        `Authenticated session created for ${walletLabel ?? walletAddress}.`,
      );
    } catch (error) {
      if (isUserRejectedSignature(error)) {
        suppressedWalletKeyRef.current = walletKey;
        notifyWalletAuthInfo("Signature cancelled", "Wallet sign-in was not completed.");
      } else {
        suppressedWalletKeyRef.current = walletKey;
        notifyWalletAuthError("Wallet sign-in failed", getFriendlyError(error));
      }
    } finally {
      inFlightRef.current = false;
      setIsAuthenticating(false);
    }
  }, [chainId, refreshSession, signMessageAsync, walletAddress, walletKey, walletLabel]);

  const logout = useCallback(async () => {
    try {
      await logoutWalletAuthSession();
      clearLocalAuthState();
      autoSignInAttemptedWalletKeyRef.current = walletKey;
      suppressedWalletKeyRef.current = walletKey;
      inFlightRef.current = false;
      setIsAuthenticating(false);
      notifyWalletAuthInfo("Signed out", "Your wallet session was cleared.");
    } catch (error) {
      notifyWalletAuthError("Logout failed", getFriendlyError(error));
    } finally {
      inFlightRef.current = false;
      setIsAuthenticating(false);
    }
  }, [clearLocalAuthState, walletKey]);

  useEffect(() => {
    if (!isConnected || !walletAddress || !chainId) {
      queueMicrotask(() => {
        clearLocalAuthState();
        inFlightRef.current = false;
        setIsAuthenticating(false);
        autoSignInAttemptedWalletKeyRef.current = null;
        suppressedWalletKeyRef.current = null;
      });
      return;
    }

    queueMicrotask(() => {
      void refreshSession().catch(() => {
        // Background rehydration is best-effort; explicit sign-in still works.
      });
    });
  }, [chainId, clearLocalAuthState, isConnected, refreshSession, walletAddress]);

  useEffect(() => {
    if (!isConnected || !walletAddress || !chainId || !isOnExpectedChain) {
      return;
    }

    if (isAuthenticated || isAuthenticating) {
      return;
    }

    if (walletKey && autoSignInAttemptedWalletKeyRef.current === walletKey) {
      return;
    }

    void loginWithWallet().catch(() => {
      // loginWithWallet already surfaces failures through notifications.
    });
  }, [
    chainId,
    isAuthenticated,
    isAuthenticating,
    isConnected,
    isOnExpectedChain,
    loginWithWallet,
    walletKey,
    walletAddress,
  ]);

  useEffect(() => {
    if (!isConnected || !walletAddress || !chainId) {
      return;
    }

    const interval = window.setInterval(() => {
      if (inFlightRef.current) {
        return;
      }
      void refreshSession().catch(() => {
        // Silent background refresh; explicit login/logout paths surface toasts.
      });
    }, 5 * 60_000);

    return () => {
      window.clearInterval(interval);
    };
    // The interval intentionally reuses the latest refresh closure.
  }, [chainId, isConnected, refreshSession, walletAddress]);

  const value = useMemo<WalletAuthContextValue>(
    () => ({
      user,
      walletAddress,
      walletAddressNormalized,
      chainId: isConnected ? chainId : null,
      sessionExpiresAt,
      isAuthenticated,
      isAuthenticating,
      loginWithWallet,
      logout,
      refreshSession,
      walletLabel,
    }),
    [
      user,
      walletAddress,
      walletAddressNormalized,
      chainId,
      isConnected,
      sessionExpiresAt,
      isAuthenticated,
      isAuthenticating,
      loginWithWallet,
      logout,
      refreshSession,
      walletLabel,
    ],
  );

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>;
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext);
  if (!context) {
    throw new Error("WalletAuthProvider is missing from the component tree.");
  }
  return context;
}
