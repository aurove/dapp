"use client";

import { useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useAccount, useChainId } from "wagmi";
import type { Abi } from "viem";

import { Button, Input } from "@ui";
import { pairKeyForPoolContractName } from "@/lib/config/supported-liquidity-pools";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import { LiquidityRangeGraph } from "../liquidity-range-graph";
import {
  formatDisplayPair,
  formatPriceLabel,
  getDisplayPriceRangeTicks,
  getPoolTickBounds,
  normalizeTickRange,
  parsePriceInputToTick,
  priceInputsForRange,
  type SlipstreamPoolState,
  type SlipstreamRangePreset,
  type SlipstreamTickRange,
} from "../slipstream-adapter";
import { amount } from "../position-display";
import {
  buildErc20ApprovalStep,
  buildManagerMulticallStep,
  buildRepositionCalls,
  wrapWithFarmHandoff,
} from "./tx";
import {
  buildRangeMigrationQuote,
  collectablePositionAmounts,
  slippageAdjustedAmount,
} from "./range-quote";
import { FarmHandoffNotice, type PositionManageSharedProps } from "./shared";

const DEFAULT_SLIPPAGE_BPS = 50;

function normalizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");
  if (fractions.length === 0) return whole;
  return `${whole}.${fractions.join("").slice(0, 18)}`;
}

export function AdjustRangePanel({
  position,
  token0,
  token1,
  displayInverted,
  managerAddress,
  managerAbi,
  deadline,
  gauge,
  restakeAfter,
  onRestakeAfterChange,
  onComplete,
  onError,
}: PositionManageSharedProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const transactionRef = useRef<TransactionFlowButtonHandle>(null);
  const currentRange = useMemo<SlipstreamTickRange>(
    () => ({ tickLower: position.tickLower, tickUpper: position.tickUpper }),
    [position.tickLower, position.tickUpper],
  );
  const [selectedRange, setSelectedRange] = useState<SlipstreamTickRange>(currentRange);
  const [rangeStrategy, setRangeStrategy] = useState<SlipstreamRangePreset>("custom");
  const [slippage, setSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const poolKey = pairKeyForPoolContractName(position.poolKey);
  const pool = useMemo<SlipstreamPoolState>(() => ({
    chainId,
    address: position.pool,
    token0: token0 ? { ...token0, name: token0.symbol } : null,
    token1: token1 ? { ...token1, name: token1.symbol } : null,
    currentTick: position.currentTick ?? null,
    sqrtPriceX96: position.sqrtPriceX96 ?? null,
    tickSpacing: position.tickSpacing,
  }), [chainId, position.currentTick, position.pool, position.sqrtPriceX96, position.tickSpacing, token0, token1]);
  const [manualRangeInputs, setManualRangeInputs] = useState(() => priceInputsForRange({ pool, range: currentRange }));
  const collected = collectablePositionAmounts(position);
  const slippageBps = BigInt(Math.min(5_000, Math.max(0, Math.round((Number(slippage) || 0) * 100))));
  const quote = useMemo(
    () =>
      buildRangeMigrationQuote({
        pool,
        currentRange,
        nextRange: selectedRange,
        amount0: collected.amount0,
        amount1: collected.amount1,
        slippageBps,
      }),
    [collected.amount0, collected.amount1, currentRange, pool, selectedRange, slippageBps],
  );
  const decreaseAmount0Min = slippageAdjustedAmount(collected.amount0, slippageBps);
  const decreaseAmount1Min = slippageAdjustedAmount(collected.amount1, slippageBps);
  const canReposition =
    Boolean(address && deadline !== null && token0 && token1 && pool.tickSpacing && quote.status === "ok" && position.liquidity > 0n);
  const approvalSteps = canReposition && token0 && token1
    ? [
        buildErc20ApprovalStep({
          key: `liquidity-range-approve-${position.tokenId}-token0`,
          label: `Approve ${token0.symbol}`,
          token: token0.address,
          spender: managerAddress,
          amount: quote.amount0Desired,
        }),
        buildErc20ApprovalStep({
          key: `liquidity-range-approve-${position.tokenId}-token1`,
          label: `Approve ${token1.symbol}`,
          token: token1.address,
          spender: managerAddress,
          amount: quote.amount1Desired,
        }),
      ]
    : [];
  const repositionStep = canReposition && deadline !== null && token0 && token1
    ? buildManagerMulticallStep({
        key: `liquidity-reposition-${position.tokenId}`,
        label: "Change range",
        address: managerAddress,
        abi: managerAbi,
        domains: ["liquidity", "wallet", "id20"],
        calls: buildRepositionCalls({
          abi: managerAbi,
          tokenId: position.tokenId,
          liquidity: position.liquidity,
          decreaseAmount0Min,
          decreaseAmount1Min,
          deadline,
          recipient: address!,
          token0: token0.address,
          token1: token1.address,
          tickSpacing: position.tickSpacing,
          tickLower: selectedRange.tickLower,
          tickUpper: selectedRange.tickUpper,
          amount0Desired: quote.amount0Desired,
          amount1Desired: quote.amount1Desired,
          amount0Min: quote.amount0Min,
          amount1Min: quote.amount1Min,
        }),
      })
    : null;
  const steps = repositionStep && address
    ? wrapWithFarmHandoff({
        isStaked: position.isStaked,
        restake: position.isStaked && restakeAfter,
        tokenId: position.tokenId,
        managerAddress,
        gaugeAddress: gauge?.address,
        gaugeAbi: gauge ? gauge.abi as Abi : undefined,
        account: address,
        inner: [...approvalSteps, repositionStep],
        mintedStepKey: repositionStep.key,
      })
    : [];
  const formik = useFormik({
    initialValues: { slippage, lower: manualRangeInputs.lower, upper: manualRangeInputs.upper },
    enableReinitialize: true,
    validationSchema: Yup.object({
      slippage: Yup.number().typeError("Enter a valid slippage.").min(0).max(50).required(),
      lower: Yup.string().required("Enter a low price."),
      upper: Yup.string().required("Enter a high price."),
    }),
    onSubmit: async () => transactionRef.current?.run(),
  });
  const usedAmounts = displayInverted
    ? [[quote.amount1Used, token1], [quote.amount0Used, token0]] as const
    : [[quote.amount0Used, token0], [quote.amount1Used, token1]] as const;
  const leftoverAmounts = displayInverted
    ? [[quote.amount1Leftover, token1], [quote.amount0Leftover, token0]] as const
    : [[quote.amount0Leftover, token0], [quote.amount1Leftover, token1]] as const;

  function applyManualRange() {
    if (!pool.tickSpacing) return;
    const lowerTick = parsePriceInputToTick({ pool, value: manualRangeInputs.lower, bound: "lower" });
    const upperTick = parsePriceInputToTick({ pool, value: manualRangeInputs.upper, bound: "upper" });
    if (lowerTick === null || upperTick === null) return;
    const nextRange = normalizeTickRange(
      lowerTick < upperTick
        ? { tickLower: lowerTick, tickUpper: upperTick }
        : { tickLower: upperTick, tickUpper: lowerTick },
      pool.tickSpacing,
      getPoolTickBounds(pool.tickSpacing),
    );
    setSelectedRange(nextRange);
    setRangeStrategy("custom");
    setManualRangeInputs(priceInputsForRange({ pool, range: nextRange }));
  }

  return (
    <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
      <div>
        <h4 className="font-medium text-white">Adjust range</h4>
        <p className="text-xs text-white/50">
          Concentrated-liquidity ranges are immutable on the NFT. This flow withdraws the current position, mints a replacement NFT on the new ticks, and burns the empty one — in a single position-manager transaction after any required token approvals.
        </p>
      </div>

      {poolKey ? (
        <LiquidityRangeGraph
          chainId={chainId}
          poolKey={poolKey}
          selectedRange={selectedRange}
          selectedStrategy={rangeStrategy}
          referenceRange={currentRange}
          onSelectionChange={(selection) => {
            if (!selection.range) return;
            setSelectedRange(selection.range);
            setRangeStrategy(selection.strategy);
            setManualRangeInputs(priceInputsForRange({ pool, range: selection.range }));
          }}
        />
      ) : (
        <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          Range chart is unavailable for this pool.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-xs text-white/60">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">Low price</span>
            <span>{formatDisplayPair(pool)}</span>
          </span>
          <input
            name="lower"
            inputMode="decimal"
            value={manualRangeInputs.lower}
            onChange={(event) => {
              const value = normalizeAmountInput(event.target.value);
              setManualRangeInputs((current) => ({ ...current, lower: value }));
              void formik.setFieldValue("lower", value);
              setRangeStrategy("custom");
            }}
            className="h-14 w-full rounded-2xl border border-white/10 bg-[#0d1319] px-4 text-xl font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-[var(--accent)]/50"
          />
        </label>
        <label className="space-y-2 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-xs text-white/60">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">High price</span>
            <span>{formatDisplayPair(pool)}</span>
          </span>
          <input
            name="upper"
            inputMode="decimal"
            value={manualRangeInputs.upper}
            onChange={(event) => {
              const value = normalizeAmountInput(event.target.value);
              setManualRangeInputs((current) => ({ ...current, upper: value }));
              void formik.setFieldValue("upper", value);
              setRangeStrategy("custom");
            }}
            className="h-14 w-full rounded-2xl border border-white/10 bg-[#0d1319] px-4 text-xl font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-[var(--accent)]/50"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <p className="text-xs leading-5 text-white/46">
          Current range {formatPriceLabel({ pool, tick: getDisplayPriceRangeTicks(pool, currentRange).lowTick })} to {formatPriceLabel({ pool, tick: getDisplayPriceRangeTicks(pool, currentRange).highTick })}. Uncollected fees are redeployed with the principal.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="h-10 rounded-full px-4"
          onClick={applyManualRange}
          disabled={
            parsePriceInputToTick({ pool, value: manualRangeInputs.lower, bound: "lower" }) === null ||
            parsePriceInputToTick({ pool, value: manualRangeInputs.upper, bound: "upper" }) === null ||
            !pool.tickSpacing
          }
        >
          Apply manual range
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <p className="text-xs text-white/45">New range status</p>
          <p className="mt-1 text-sm font-medium text-white">{quote.beginsInRange ? "In range" : "Out of range"}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <p className="text-xs text-white/45">Deployed</p>
          {usedAmounts.map(([raw, token], index) => (
            <p key={index} className="mt-1 truncate text-sm font-medium text-white">{amount(raw, token)}</p>
          ))}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <p className="text-xs text-white/45">Returned to wallet</p>
          {leftoverAmounts.map(([raw, token], index) => (
            <p key={index} className="mt-1 truncate text-sm font-medium text-white">
              {token ? formatCompactRawTokenAmount(raw, token.decimals, token.symbol) : "Unavailable"}
            </p>
          ))}
        </div>
      </div>

      {position.liquidity <= 0n ? (
        <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          This NFT has no active liquidity. Add liquidity on the current ticks, or open a new position to choose a different range.
        </p>
      ) : quote.errorMessage ? (
        <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          {quote.errorMessage}
        </p>
      ) : null}

      <FarmHandoffNotice
        isStaked={position.isStaked}
        restakeAfter={restakeAfter}
        onRestakeAfterChange={onRestakeAfterChange}
      />

      <div className="grid gap-2 lg:grid-cols-[minmax(7.5rem,1fr)_5fr] lg:items-end">
        <label className="block text-xs text-white/60">
          Slippage (%)
          <Input
            name="slippage"
            value={slippage}
            onBlur={formik.handleBlur}
            onChange={(event) => {
              setSlippage(event.target.value);
              void formik.setFieldValue("slippage", event.target.value);
            }}
            inputMode="decimal"
            className="mt-1 h-10"
          />
        </label>
        <TransactionFlowButton
          ref={transactionRef}
          type="submit"
          className="h-10 w-full"
          steps={steps}
          disabled={!canReposition || steps.length === 0 || deadline === null}
          onComplete={onComplete(restakeAfter && position.isStaked ? "Range changed and position restaked." : "Range changed. The previous NFT was burned.")}
          onError={onError}
        >
          Preview and change range
        </TransactionFlowButton>
      </div>
    </form>
  );
}
