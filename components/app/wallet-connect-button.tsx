"use client";

import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown } from "lucide-react";
import { Button } from "@fractals/ui/ui/button";
import { useAppChainSwitch } from "@/lib/web3/use-app-chain-switch";

type WalletConnectButtonProps = {
  children?: ReactNode;
};

export function WalletConnectButton({ children }: WalletConnectButtonProps) {
  const { expectedChain, switchToExpectedChain } = useAppChainSwitch();

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const wrongNetwork = Boolean(chain?.unsupported || chain?.id !== expectedChain.id);

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
          return children;
        }

        return (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openChainModal}>
              {chain.name}
            </Button>
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
