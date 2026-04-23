"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Address } from "viem";

import { useTxFlowProvider } from "./context";
import { bindStepResultsStore, executePreparedWriteStep } from "./execute";
import { getParsedError } from "./getParsedError";
import type { TxFlowBuilder, TxIconState, TxStep, TxStepResult } from "./types";
import WalletGate from "./WalletGate";

type RenderState = {
  connected: boolean;
  wrongNetwork: boolean;
  loading: boolean;
  label: React.ReactNode;
  iconState: TxIconState;
  openConnectModal?: () => void;
  openChainModal?: () => void;
  run: () => void;
};

type Props = {
  steps: TxStep[] | TxFlowBuilder;
  children: React.ReactNode;
  icon?: React.ReactNode;
  renderStatusIcon?: (state: TxIconState) => React.ReactNode;
  render?: (state: RenderState) => React.ReactNode;
  className?: string;
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
  render,
  ...props
}: Props) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient()!;
  const { writeContractAsync } = useWriteContract();
  const { contracts, notify, iconState, setIconState } = useTxFlowProvider();

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
    <WalletGate>
      {({ connected, wrongNetwork, openConnectModal, openChainModal }) => {
        const state: RenderState = {
          connected,
          wrongNetwork,
          loading: running,
          label,
          iconState,
          openConnectModal,
          openChainModal,
          run: handleClick,
        };

        if (render) {
          return render(state);
        }

        const onClick = !connected ? openConnectModal : wrongNetwork ? openChainModal : handleClick;
        const isDisabled = !connected ? false : wrongNetwork ? false : !canRun;

        return (
          <button
            type="button"
            className={className}
            onClick={onClick}
            disabled={isDisabled}
            aria-busy={connected && !wrongNetwork ? running : false}
            {...props}
          >
            {icon}
            <span>{!connected ? "Connect Wallet" : wrongNetwork ? "Wrong network" : label}</span>
            {connected && !wrongNetwork && renderStatusIcon ? renderStatusIcon(iconState) : null}
          </button>
        );
      }}
    </WalletGate>
  );
}
