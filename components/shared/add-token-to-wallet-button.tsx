"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import type { Address } from "viem";
import { Button, type ButtonProps } from "@fractals/ui/ui/button";
import { notify } from "@/lib/notifications";
import { watchTokenAsset } from "@/lib/web3/watch-asset";

type AddTokenToWalletButtonProps = {
  address: Address;
  symbol: string;
  decimals?: number;
  tokenId?: bigint;
  className?: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
};

export function AddTokenToWalletButton({
  address,
  symbol,
  decimals = 18,
  tokenId,
  className,
  label = "Add to MetaMask",
  size = "sm",
  variant = "outline",
}: AddTokenToWalletButtonProps) {
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  const handleClick = async () => {
    if (status !== "idle") return;

    setStatus("pending");

    try {
      const accepted = await watchTokenAsset({ address, symbol, decimals, tokenId });
      if (!accepted) {
        setStatus("idle");
        return;
      }

      setStatus("done");
      notify.success(
        `${symbol} added to MetaMask`,
        "The fraction token is now available in your wallet.",
      );
    } catch (error) {
      setStatus("idle");
      notify.error(
        `Could not add ${symbol}`,
        error instanceof Error ? error.message : "The wallet asset request failed.",
      );
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={status !== "idle"}
    >
      {status === "pending" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === "done" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <Wallet className="h-3.5 w-3.5" />
      )}
      <span>{status === "done" ? "Added" : label}</span>
    </Button>
  );
}
