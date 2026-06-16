"use client";

import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@ui";
import { useWalletAuth } from "@/lib/auth/provider";
import { useAppChainSwitch } from "@/lib/web3/use-app-chain-switch";

type WalletConnectButtonProps = {
  children?: ReactNode;
};

export function WalletConnectButton({ children }: WalletConnectButtonProps) {
  const { expectedChain, switchToExpectedChain } = useAppChainSwitch();
  const { isAuthenticated, isAuthenticating, loginWithWallet } = useWalletAuth();

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const wrongNetwork = Boolean(chain?.unsupported || chain?.id !== expectedChain.id);
        const needsSignIn = connected && !isAuthenticated;
        const handleSignIn = () => {
          void loginWithWallet({ force: true });
        };

        const signInButton = (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSignIn}
            disabled={isAuthenticating}
            className="gap-2"
          >
            {isAuthenticating ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogIn className="h-3.5 w-3.5" />
            )}
            {isAuthenticating ? "Signing In" : "Sign In"}
          </Button>
        );

        if (!connected) {
          return (
            <Button size="sm" onClick={openConnectModal}>
              Connect Wallet
            </Button>
          );
        }

        if (wrongNetwork) {
          return (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                void switchToExpectedChain(openChainModal);
              }}
            >
              Wrong Network
            </Button>
          );
        }

        if (children != null) {
          return (
            <div className="flex items-center gap-2">
              {children}
              {needsSignIn ? signInButton : null}
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            {needsSignIn ? signInButton : null}
            <Button variant="secondary" size="sm" onClick={openAccountModal} className="gap-1">
              {account.displayName}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
