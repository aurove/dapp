"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown } from "lucide-react";
import { Button } from "@fractals/ui/ui/button";

export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <Button size="sm" onClick={openConnectModal}>
              Connect Wallet
            </Button>
          );
        }

        if (chain.unsupported) {
          return (
            <Button size="sm" variant="destructive" onClick={openChainModal}>
              Wrong Network
            </Button>
          );
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
