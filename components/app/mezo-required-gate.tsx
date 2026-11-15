"use client";

import type { ReactNode } from "react";
import { useChainId } from "wagmi";
import { ArrowLeftRight } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui";
import { baseSepoliaChain, mezoTestnetChain, resolveAppEnvironment } from "@/lib/config/chains";
import { useAppChainSwitch } from "@/lib/web3/use-app-chain-switch";

type MezoRequiredGateProps = {
  children: ReactNode;
  /** Short feature name for copy, e.g. "Earn". */
  feature?: string;
};

/**
 * Renders children on Mezo; on Base Sepolia (testnet) shows a switch CTA.
 * Mainnet/local always pass through (Base is not an allowed peer there).
 */
export function MezoRequiredGate({ children, feature = "This page" }: MezoRequiredGateProps) {
  const environment = resolveAppEnvironment();
  const chainId = useChainId();
  const { switchToMezo } = useAppChainSwitch();

  if (environment !== "testnet" || chainId !== baseSepoliaChain.id) {
    return <>{children}</>;
  }

  return (
    <Card className="border-[var(--accent)]/30">
      <CardHeader>
        <CardTitle>Switch to Mezo Testnet</CardTitle>
        <CardDescription className="mt-1">
          {feature} runs on {mezoTestnetChain.name}. Your wallet is on {baseSepoliaChain.name} —
          use Horizon Bridge or Swap there, or switch networks to continue here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void switchToMezo()}>
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Switch to {mezoTestnetChain.name}
        </Button>
        <Button asChild variant="outline">
          <a href="/swap">Open Swap on Base</a>
        </Button>
        <Button asChild variant="ghost">
          <a href="/bridge">Open Bridge</a>
        </Button>
      </CardContent>
    </Card>
  );
}
