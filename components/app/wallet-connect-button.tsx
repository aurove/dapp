"use client";

import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, LoaderCircle, LogIn } from "lucide-react";
import { Button } from "@ui";
import { useWalletAuth } from "@/lib/auth/provider";
import { useAppChainSwitch } from "@/lib/web3/use-app-chain-switch";
import { NetworkControl } from "@/components/app/network-control";

type WalletConnectButtonProps = {
  children?: ReactNode;
};

export function WalletConnectButton({ children }: WalletConnectButtonProps) {
  const { isAllowedChain, switchToExpectedChain, switchableChains } = useAppChainSwitch();
  const { isAuthenticated, isAuthenticating, loginWithWallet } = useWalletAuth();
  const showNetworkControl = switchableChains.length > 1;

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        // Unsupported chain (e.g. Ethereum mainnet) — not Mezo/Base on testnet.
        const wrongNetwork = Boolean(connected && !isAllowedChain(chain?.id, chain?.unsupported));
        const needsSignIn = connected && !isAuthenticated;
        const handleSignIn = () => {
          void loginWithWallet({ force: true });
        };

        const signInButton = (
          <Button
            type="button"
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
            <div className="flex items-center gap-2">
              {showNetworkControl ? <NetworkControl className="hidden sm:inline-flex" /> : null}
              <Button type="button" size="sm" onClick={openConnectModal}>
                Connect Wallet
              </Button>
            </div>
          );
        }

        if (wrongNetwork) {
          return (
            <div className="flex items-center gap-2">
              {showNetworkControl ? <NetworkControl /> : null}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  void switchToExpectedChain(openChainModal);
                }}
              >
                Wrong Network
              </Button>
            </div>
          );
        }

        if (children != null) {
          return (
            <div className="flex items-center gap-2">
              {showNetworkControl ? <NetworkControl /> : null}
              {children}
              {needsSignIn ? signInButton : null}
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2">
            {showNetworkControl ? <NetworkControl /> : null}
            {needsSignIn ? signInButton : null}
            <Button type="button" variant="secondary" size="sm" onClick={openAccountModal} className="gap-1">
              {account.displayName}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
