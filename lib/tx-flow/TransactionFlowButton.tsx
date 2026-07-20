"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Button } from "@ui";

import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { useTxFlowRuntime } from "@/lib/providers/web3-providers";

import { bindStepResultsStore, executePreparedWriteStep } from "./execute";
import { getParsedError } from "./getParsedError";
import type { TxFlowBuilder, TxIconState, TxStep, TxStepResult } from "./types";

type Props = Omit<ComponentPropsWithoutRef<typeof Button>, "children" | "onClick" | "onError"> & {
  steps: TxStep[] | TxFlowBuilder;
  children: ReactNode;
  icon?: ReactNode;
  renderStatusIcon?: (state: TxIconState) => ReactNode;
  disabled?: boolean;
  onComplete?: (results: TxStepResult[]) => void;
  onError?: (err: string, resultsSoFar: TxStepResult[]) => void;
};

export type TransactionFlowButtonHandle = {
  run: () => Promise<void>;
};

const TransactionFlowButton = forwardRef<TransactionFlowButtonHandle, Props>(function TransactionFlowButton({
  steps,
  children,
  className,
  disabled,
  onComplete,
  onError,
  icon,
  renderStatusIcon,
  type = "button",
  ...props
}, ref) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient()!; // will be available since we wrap display in connect btn
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const { contracts, notify, iconState, setIconState } = useTxFlowRuntime();

  const [running, setRunning] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const canRun = Boolean(address && !running && !disabled);

  const handleClick = async () => {
    if (!address || !chain || running || disabled) return;

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
        queryClient,
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
      notify?.error(activeLabel ?? "Transaction failed", parsed);
      onError?.(parsed, results);
      console.trace(error);
    } finally {
      setRunning(false);
      setActiveLabel(null);
    }
  };

  useImperativeHandle(ref, () => ({ run: handleClick }));

  const label = running && activeLabel ? activeLabel : children;

  return (
    <WalletConnectButton>
      <Button
        {...props}
        type={type}
        className={className}
        onClick={type === "submit" ? undefined : handleClick}
        disabled={!canRun}
        aria-busy={running}
      >
        {icon}
        <span>{label}</span>
        {renderStatusIcon ? renderStatusIcon(iconState) : null}
      </Button>
    </WalletConnectButton>
  );
});

export default TransactionFlowButton;
