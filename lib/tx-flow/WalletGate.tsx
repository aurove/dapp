"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

import { useChainId } from "wagmi";

export type WalletGateRenderProps = {
  connected: boolean;
  wrongNetwork: boolean;
  openConnectModal?: () => void;
  openChainModal?: () => void;
};

export type WalletGateProps = {
  children: (props: WalletGateRenderProps) => React.ReactNode;
};

export default function WalletGate({ children }: WalletGateProps) {
  const targetChainId = useChainId();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        const connected = Boolean(mounted && account && chain);
        const wrongNetwork = Boolean(
          connected && (chain?.unsupported || chain?.id !== targetChainId),
        );

        return children({
          connected,
          wrongNetwork,
          openConnectModal,
          openChainModal,
        });
      }}
    </ConnectButton.Custom>
  );
}
