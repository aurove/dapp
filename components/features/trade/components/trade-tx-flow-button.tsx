"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@fractals/ui/components/ui/button";
import { TransactionFlowButton } from "@/lib/tx-flow";
import type { TxStep, TxStepResult } from "@/lib/tx-flow";

type TradeTxFlowButtonProps = {
  children: string;
  steps: TxStep[] | ((ctx: { account: `0x${string}`; chainId: number }) => TxStep[]);
  disabled?: boolean;
  targetChainId: number;
  className?: string;
  beforeRun?: () => Promise<boolean> | boolean;
  onStart?: () => void;
  onRunningChange?: (running: boolean) => void;
  onComplete?: (results: TxStepResult[]) => void;
  onError?: (message: string) => void;
};

type TradeTxFlowButtonContentProps = {
  buttonLabel: string;
  className?: string;
  disabled?: boolean;
  beforeRun?: () => Promise<boolean> | boolean;
  onStart?: () => void;
  onRunningChange?: (running: boolean) => void;
  loading: boolean;
  label: React.ReactNode;
  run: () => void;
};

type TransactionFlowRenderState = {
  loading: boolean;
  label: React.ReactNode;
  run: () => void;
};

function TradeTxFlowButtonContent({
  buttonLabel,
  className,
  disabled,
  beforeRun,
  onStart,
  onRunningChange,
  loading,
  label,
  run,
}: TradeTxFlowButtonContentProps) {
  const previousLoading = useRef(loading);

  useEffect(() => {
    if (previousLoading.current !== loading) {
      onRunningChange?.(loading);
      previousLoading.current = loading;
    }
  }, [loading, onRunningChange]);

  const handleClick = async () => {
    if (beforeRun) {
      const shouldRun = await beforeRun();
      if (!shouldRun) return;
    }

    onStart?.();
    run();
  };

  return (
    <Button
      type="button"
      className={className}
      disabled={disabled || loading}
      onClick={() => void handleClick()}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {String(label ?? buttonLabel)}
    </Button>
  );
}

export function TradeTxFlowButton({
  children,
  steps,
  disabled,
  className,
  beforeRun,
  onStart,
  onRunningChange,
  onComplete,
  onError,
}: TradeTxFlowButtonProps) {
  return (
    <TransactionFlowButton
      steps={steps}
      disabled={disabled}
      onComplete={onComplete}
      onError={onError}
      render={({ loading, label, run }: TransactionFlowRenderState) => (
        <TradeTxFlowButtonContent
          buttonLabel={children}
          className={className}
          disabled={disabled}
          beforeRun={beforeRun}
          onStart={onStart}
          onRunningChange={onRunningChange}
          loading={loading}
          label={label}
          run={run}
        />
      )}
    >
      {children}
    </TransactionFlowButton>
  );
}
