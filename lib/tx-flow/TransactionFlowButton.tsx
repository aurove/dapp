"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button } from "@fractals/ui/ui/button";

import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";

import { bindStepResultsStore, executePreparedWriteStep } from "./execute";
import { getParsedError } from "./getParsedError";
import type { TxFlowBuilder, TxIconState, TxStep, TxStepResult } from "./types";

type Props = Omit<ComponentPropsWithoutRef<typeof Button>, "children" | "onClick"> & {
  steps: TxStep[] | TxFlowBuilder;
  children: ReactNode;
  icon?: ReactNode;
  renderStatusIcon?: (state: TxIconState) => ReactNode;
  disabled?: boolean;
  onComplete?: (results: TxStepResult[]) => void;
  onError?: (err: string, resultsSoFar: TxStepResult[]) => void;
};

export default function TransactionFlowButton({
  steps,
  children,
  className,
  disabled,
  onComplete,
  onError,
  icon,
  renderStatusIcon,
  ...props
}: Props) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient()!; // will be available since we wrap display in connect btn
  const { writeContractAsync } = useWriteContract();

  const { contracts, notify, iconState, setIconState } = useTxFlowRuntime();

  const [running, setRunning] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const canRun = Boolean(address && !running && !disabled);

  const handleClick = async () => {
    if (!address || !chain) return;

    setIconState("pending");

    const results: TxStepResult[] = [];

    try {
      const ctx = {
        account: address as Address,
        chainId: chain.id,
        publicClient,
        writeAsync: writeContractAsync,
        contracts,
        notify,
      };

      const builtSteps =
        typeof steps === "function" ? steps({ account: ctx.account, chainId: ctx.chainId }) : steps;

      bindStepResultsStore(ctx, results);

      setRunning(true);
      setActiveLabel(null);

      for (const step of builtSteps) {
        if (step.displayLabelBtn) {
          setActiveLabel(step.label);
        }

        const res =
          step.type === "write" ? await executePreparedWriteStep(step, ctx) : await step.run(ctx);

        if (res === "skip") {
          results.push({
            key: step.key,
            label: step.label,
            skipped: true,
          });
          continue;
        }

        results.push({
          key: step.key,
          label: step.label,
          hash: res.hash,
          receipt: res.receipt,
          skipped: false,
        });
      }

      setIconState("success");
      onComplete?.(results);
    } catch (error) {
      const parsed = getParsedError(error);
      setIconState("error");
      onError?.(parsed, results);
      throw error;
    } finally {
      setRunning(false);
      setActiveLabel(null);
    }
  };

  const label = running && activeLabel ? activeLabel : children;

  return (
    <WalletConnectButton>
      <Button
        {...props}
        type="button"
        className={className}
        onClick={handleClick}
        disabled={!canRun}
        aria-busy={running}
      >
        {icon}
        <span>{label}</span>
        {renderStatusIcon ? renderStatusIcon(iconState) : null}
      </Button>
    </WalletConnectButton>
  );
}
