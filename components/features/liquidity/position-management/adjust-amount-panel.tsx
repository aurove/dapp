"use client";

import { useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Coins, Plus, Trash2 } from "lucide-react";
import { formatUnits, type Abi } from "viem";
import { useAccount, useChainId } from "wagmi";

import { Input } from "@ui";
import {
  getLiquidityId20GaugeDescriptors,
  makeId20ActivationGuardSteps,
  useId20GaugePositions,
} from "@/components/features/id20/use-id20-gauges";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, permanentVeNftUnlockSteps, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import { LiquidityTokenInput } from "../liquidity-token-input";
import {
  buildLiquidityApprovalStep,
  buildLiquidityRouterCall,
  buildLiquiditySourceOptions,
  resolveSelectedLiquiditySource,
} from "../liquidity-source-routing";
import { buildSlipstreamLiquidityQuote, type SlipstreamLiquiditySide } from "../slipstream-liquidity-quote";
import type { SlipstreamPoolState } from "../slipstream-adapter";
import { amount } from "../position-display";
import {
  buildCollectFeesStep,
  buildManagerMulticallStep,
  buildRemoveLiquidityCalls,
  withPortfolioDomains,
  wrapWithFarmHandoff,
} from "./tx";
import { slippageAdjustedAmount } from "./range-quote";
import { FarmHandoffNotice, SegmentedControl, type PositionManageSharedProps } from "./shared";

const DEFAULT_SLIPPAGE_BPS = 50;

type AmountMode = "add" | "remove";

export function AdjustAmountPanel({
  position,
  token0,
  token1,
  displayInverted,
  managerAddress,
  managerAbi,
  routerAddress,
  routerAbi,
  ledgerAddress,
  deadline,
  portfolio,
  veCollections,
  gauge,
  restakeAfter,
  onRestakeAfterChange,
  onComplete,
  onError,
}: PositionManageSharedProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const id20Gauges = useId20GaugePositions(chainId, address);
  const removeTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const increaseTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const burnTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const collectTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const [mode, setMode] = useState<AmountMode>(position.liquidity > 0n ? "add" : "remove");
  const [percent, setPercent] = useState("25");
  const [slippage, setSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const [increaseSlippage, setIncreaseSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const [increaseActiveSide, setIncreaseActiveSide] = useState<SlipstreamLiquiditySide>("assetA");
  const [increaseDrafts, setIncreaseDrafts] = useState<Record<SlipstreamLiquiditySide, string>>({ assetA: "", assetB: "" });
  const [increaseSourceIds, setIncreaseSourceIds] = useState<Record<SlipstreamLiquiditySide, string | null>>({ assetA: null, assetB: null });
  const [burnConfirmed, setBurnConfirmed] = useState(false);
  const [burnAfterRemove, setBurnAfterRemove] = useState(true);
  const numericPercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const removeLiquidity = (position.liquidity * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated0 = position.rawAmount0 === undefined ? undefined : (position.rawAmount0 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated1 = position.rawAmount1 === undefined ? undefined : (position.rawAmount1 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const slippageBps = BigInt(Math.min(5_000, Math.max(0, Math.round((Number(slippage) || 0) * 100))));
  const min0 = estimated0 === undefined ? 0n : slippageAdjustedAmount(estimated0, slippageBps);
  const min1 = estimated1 === undefined ? 0n : slippageAdjustedAmount(estimated1, slippageBps);
  const removingAll = numericPercent === 100;
  const canBurn = !position.isStaked && position.liquidity === 0n && position.tokensOwed0 === 0n && position.tokensOwed1 === 0n;
  const hasFees = !position.isStaked && (position.tokensOwed0 > 0n || position.tokensOwed1 > 0n);
  const estimatedAmounts = displayInverted
    ? [[estimated1, token1], [estimated0, token0]] as const
    : [[estimated0, token0], [estimated1, token1]] as const;
  const feeAmounts = displayInverted
    ? [[position.tokensOwed1, token1], [position.tokensOwed0, token0]] as const
    : [[position.tokensOwed0, token0], [position.tokensOwed1, token1]] as const;
  const increasePool = useMemo<SlipstreamPoolState>(() => ({
    chainId: 0,
    address: position.pool,
    token0: token0 ? { ...token0, name: token0.symbol } : null,
    token1: token1 ? { ...token1, name: token1.symbol } : null,
    currentTick: position.currentTick ?? null,
    sqrtPriceX96: position.sqrtPriceX96 ?? null,
    tickSpacing: position.tickSpacing,
  }), [position.currentTick, position.pool, position.sqrtPriceX96, position.tickSpacing, token0, token1]);
  const increaseSources = useMemo(() => buildLiquiditySourceOptions({
    pool: increasePool,
    portfolio,
    veCollections,
    ledgerAddress,
  }), [increasePool, portfolio, veCollections, ledgerAddress]);
  const increaseSourceA = useMemo(
    () => resolveSelectedLiquiditySource(increaseSources.assetA, increaseSourceIds.assetA),
    [increaseSourceIds.assetA, increaseSources.assetA],
  );
  const increaseSourceB = useMemo(
    () => resolveSelectedLiquiditySource(increaseSources.assetB, increaseSourceIds.assetB),
    [increaseSourceIds.assetB, increaseSources.assetB],
  );
  const increaseActiveToken = increaseActiveSide === "assetA" ? token0 : token1;
  const increaseActiveAmount = increaseActiveToken
    ? parseAmountRaw(increaseDrafts[increaseActiveSide], increaseActiveToken.decimals) ?? 0n
    : 0n;
  const increaseSlippageBps = BigInt(Math.min(5_000, Math.max(0, Math.round((Number(increaseSlippage) || 0) * 100))));
  const increaseQuote = useMemo(() => buildSlipstreamLiquidityQuote({
    pool: increasePool,
    range: { tickLower: position.tickLower, tickUpper: position.tickUpper },
    activeSide: increaseActiveSide,
    activeAmountRaw: increaseActiveAmount,
    sourceA: increaseSourceA,
    sourceB: increaseSourceB,
    receiver: address ?? null,
    deadline,
    slippageBps: increaseSlippageBps,
  }), [address, deadline, increaseActiveAmount, increaseActiveSide, increasePool, increaseSlippageBps, increaseSourceA, increaseSourceB, position.tickLower, position.tickUpper]);
  const increaseRouterCall = increaseQuote.status === "ok" && increaseQuote.routerPlan
    ? buildLiquidityRouterCall(increaseQuote.routerPlan, "increase", position.tokenId)
    : null;
  const routerSupportsIncrease = increaseRouterCall !== null && routerAbi.some(
    (item) => item.type === "function" && item.name === increaseRouterCall.functionName,
  );
  const requiredId20Gauges = useMemo(
    () => getLiquidityId20GaugeDescriptors(chainId, [token0?.address, token1?.address]),
    [chainId, token0?.address, token1?.address],
  );
  const inactiveRequiredId20s = useMemo(() => {
    const required = new Set(requiredId20Gauges.map((item) => item.id20Address.toLowerCase()));
    return id20Gauges.gauges.filter(
      (item) => required.has(item.id20Address.toLowerCase()) && !item.isActivated,
    );
  }, [id20Gauges.gauges, requiredId20Gauges]);

  const increaseInnerSteps: TxStep[] = requiredId20Gauges.flatMap(makeId20ActivationGuardSteps);
  if (increaseQuote.status === "ok" && increaseQuote.routerPlan && increaseRouterCall && routerSupportsIncrease && increaseSourceA && increaseSourceB) {
    increaseInnerSteps.push(
      ...permanentVeNftUnlockSteps([
        increaseSourceA.kind === "venft" ? increaseSourceA : null,
        increaseSourceB.kind === "venft" ? increaseSourceB : null,
      ]),
    );
    const approvalA = buildLiquidityApprovalStep({
      source: increaseSourceA,
      input: increaseQuote.routerPlan.inputA,
      routerAddress,
      suffix: `increase-${position.tokenId}-assetA`,
    });
    const approvalB = buildLiquidityApprovalStep({
      source: increaseSourceB,
      input: increaseQuote.routerPlan.inputB,
      routerAddress,
      suffix: `increase-${position.tokenId}-assetB`,
    });
    if (approvalA) increaseInnerSteps.push(approvalA);
    if (approvalB) increaseInnerSteps.push(approvalB);
    increaseInnerSteps.push(withPortfolioDomains(makeAddressWriteStep({
      key: "liquidity-increase",
      label: "Increase liquidity",
      displayLabelBtn: true,
      address: routerAddress,
      abi: routerAbi,
      variables: increaseRouterCall,
    }) as TxStep, ["liquidity", "wallet", "tranches", "id20", "rewards"]));
  }
  const increaseSteps = address
    ? wrapWithFarmHandoff({
        isStaked: position.isStaked,
        restake: position.isStaked && restakeAfter,
        tokenId: position.tokenId,
        managerAddress,
        gaugeAddress: gauge?.address,
        gaugeAbi: gauge ? gauge.abi as Abi : undefined,
        account: address,
        inner: increaseInnerSteps,
      })
    : [];

  const collectSteps = address && hasFees
    ? [buildCollectFeesStep({
        tokenId: position.tokenId,
        recipient: address,
        managerAddress,
        managerAbi,
      })]
    : [];
  const removeCalls = address && deadline !== null && removeLiquidity > 0n
    ? buildRemoveLiquidityCalls({
        abi: managerAbi,
        tokenId: position.tokenId,
        liquidity: removeLiquidity,
        amount0Min: min0,
        amount1Min: min1,
        deadline,
        recipient: address,
        burnEmptyNft: removingAll && burnAfterRemove,
      })
    : [];
  const removeInner = removeCalls.length > 0
    ? [buildManagerMulticallStep({
        key: "liquidity-remove",
        label: removingAll ? "Remove all liquidity" : "Remove liquidity",
        address: managerAddress,
        abi: managerAbi,
        calls: removeCalls,
        domains: ["liquidity", "wallet", "id20"],
      })]
    : [];
  const removeSteps = address
    ? wrapWithFarmHandoff({
        isStaked: position.isStaked,
        restake: position.isStaked && restakeAfter && !removingAll,
        tokenId: position.tokenId,
        managerAddress,
        gaugeAddress: gauge?.address,
        gaugeAbi: gauge ? gauge.abi as Abi : undefined,
        account: address,
        inner: removeInner,
      })
    : [];

  const removeFormik = useFormik({
    initialValues: { percent, slippage },
    enableReinitialize: true,
    validationSchema: Yup.object({
      percent: Yup.number().typeError("Enter a valid percentage.").moreThan(0).max(100).required(),
      slippage: Yup.number().typeError("Enter a valid slippage.").min(0).max(50).required(),
    }),
    onSubmit: async () => removeTransactionRef.current?.run(),
  });
  const burnFormik = useFormik({
    initialValues: { burnConfirmed },
    enableReinitialize: true,
    validationSchema: Yup.object({
      burnConfirmed: Yup.boolean().oneOf([true], "Confirm the permanent burn before continuing."),
    }),
    onSubmit: async () => burnTransactionRef.current?.run(),
  });
  const increaseFormik = useFormik({
    initialValues: { amount: increaseDrafts[increaseActiveSide], slippage: increaseSlippage },
    enableReinitialize: true,
    validationSchema: Yup.object({
      amount: Yup.string()
        .required("Enter an amount.")
        .test("valid-amount", "Enter a valid amount.", () => increaseActiveAmount > 0n)
        .test("valid-quote", increaseQuote.errorMessage ?? "A valid liquidity quote is required.", () => increaseQuote.status === "ok")
        .test("router-support", "The configured zap router must be upgraded before increasing this position.", () => routerSupportsIncrease),
      slippage: Yup.number().typeError("Enter a valid slippage.").min(0).max(50).required(),
    }),
    onSubmit: async () => increaseTransactionRef.current?.run(),
  });

  const increaseValue = (side: SlipstreamLiquiditySide) => {
    if (side === increaseActiveSide) return increaseDrafts[side];
    const token = side === "assetA" ? token0 : token1;
    const raw = side === "assetA" ? increaseQuote.amountAUsedRaw : increaseQuote.amountBUsedRaw;
    return token && raw !== null ? formatUnits(raw, token.decimals) : "";
  };
  const updateIncreaseAmount = (side: SlipstreamLiquiditySide, value: string) => {
    setIncreaseActiveSide(side);
    setIncreaseDrafts((current) => ({ ...current, [side]: value }));
    void increaseFormik.setFieldValue("amount", value, false);
  };
  const selectIncreaseSource = (side: SlipstreamLiquiditySide, sourceId: string) => {
    const sources = side === "assetA" ? increaseSources.assetA : increaseSources.assetB;
    const source = sources.find((candidate) => candidate.id === sourceId);
    setIncreaseSourceIds((current) => ({ ...current, [side]: sourceId }));
    if (source?.kind === "venft") {
      const value = formatUnits(source.balanceRaw, source.decimals);
      setIncreaseActiveSide(side);
      setIncreaseDrafts((current) => ({ ...current, [side]: value }));
      void increaseFormik.setFieldValue("amount", value, false);
    }
  };
  const maxIncreaseSource = (side: SlipstreamLiquiditySide) => {
    const source = side === "assetA" ? increaseSourceA : increaseSourceB;
    if (!source) return;
    updateIncreaseAmount(side, formatUnits(source.balanceRaw, source.decimals));
  };
  const increaseDisplaySides: readonly SlipstreamLiquiditySide[] = displayInverted
    ? ["assetB", "assetA"]
    : ["assetA", "assetB"];
  const completeAndRefresh = (message: string) => () => {
    void id20Gauges.refresh();
    onComplete(message)();
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-white">Adjust amount</h4>
        <p className="text-xs text-white/50">
          Add more liquidity in the current ticks, or withdraw a percentage. Removal collects owed tokens in the same position-manager transaction.
        </p>
      </div>

      {hasFees ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-50">Uncollected fees</p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-emerald-100/80">
              {feeAmounts.map(([raw, token], index) => (
                <span key={index}>{amount(raw, token)}</span>
              ))}
            </div>
          </div>
          <TransactionFlowButton
            ref={collectTransactionRef}
            className="sm:w-auto"
            steps={collectSteps}
            disabled={!address || collectSteps.length === 0}
            icon={<Coins className="h-4 w-4" />}
            onComplete={completeAndRefresh("Fees collected.")}
            onError={onError}
          >
            Collect fees
          </TransactionFlowButton>
        </div>
      ) : null}

      <FarmHandoffNotice
        isStaked={position.isStaked}
        restakeAfter={restakeAfter}
        onRestakeAfterChange={onRestakeAfterChange}
        restakeEnabled={mode !== "remove" || !removingAll}
      />

      <SegmentedControl
        value={mode}
        onChange={setMode}
        ariaLabel="Adjust amount mode"
        options={[
          { id: "add", label: "Add" },
          { id: "remove", label: "Remove" },
        ]}
      />

      {mode === "add" ? (
        <form onSubmit={increaseFormik.handleSubmit} noValidate className="space-y-3 rounded-2xl border border-white/15 bg-black/10 p-5">
          <p className="text-xs text-white/50">Supply more tokens into this NFT&apos;s exact range.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {increaseDisplaySides.map((side) => {
              const token = side === "assetA" ? token0 : token1;
              const sources = side === "assetA" ? increaseSources.assetA : increaseSources.assetB;
              const source = side === "assetA" ? increaseSourceA : increaseSourceB;
              return (
                <LiquidityTokenInput
                  key={side}
                  id={`increase-${position.tokenId}-${side}`}
                  actionLabel="Supply"
                  tokenSymbol={token?.symbol ?? null}
                  value={increaseValue(side)}
                  balanceLabel={source ? formatCompactRawTokenAmount(source.balanceRaw, source.decimals, null) : "Unavailable"}
                  isEditing={increaseActiveSide === side && source?.kind !== "venft"}
                  disabled={!token || sources.length === 0}
                  loading={!portfolio}
                  insufficientBalance={increaseQuote.status === "insufficient-balance"}
                  canMax={Boolean(source && source.balanceRaw > 0n)}
                  sources={sources}
                  selectedSource={source}
                  onFocus={() => { if (source?.kind !== "venft") setIncreaseActiveSide(side); }}
                  onChange={(value) => updateIncreaseAmount(side, value)}
                  onMax={() => maxIncreaseSource(side)}
                  onSelectSource={(sourceId) => selectIncreaseSource(side, sourceId)}
                />
              );
            })}
          </div>
          {inactiveRequiredId20s.length > 0 ? (
            <p role="status" className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">
              Activate {inactiveRequiredId20s.map((item) => item.symbol).join(" and ")} rewards first. The activation step is included and these increase-liquidity inputs will be preserved.
            </p>
          ) : null}
          {increaseRouterCall && !routerSupportsIncrease ? (
            <p role="status" className="text-xs text-amber-100">
              The configured zap router does not yet expose position-aware increase methods. Deploy and sync the updated router before using this action.
            </p>
          ) : null}
          {increaseFormik.submitCount > 0 && (increaseFormik.errors.amount || increaseFormik.errors.slippage) ? (
            <p role="alert" className="text-xs text-red-200">{increaseFormik.errors.amount ?? increaseFormik.errors.slippage}</p>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-[minmax(7.5rem,1fr)_5fr] lg:items-end">
            <label className="block text-xs text-white/60">
              Slippage (%)
              <Input
                name="slippage"
                value={increaseSlippage}
                onBlur={increaseFormik.handleBlur}
                onChange={(event) => {
                  setIncreaseSlippage(event.target.value);
                  void increaseFormik.setFieldValue("slippage", event.target.value);
                }}
                inputMode="decimal"
                className="mt-1 h-10"
              />
            </label>
            <TransactionFlowButton
              ref={increaseTransactionRef}
              type="submit"
              className="h-10 w-full"
              variant="secondary"
              steps={increaseSteps}
              disabled={increaseQuote.status !== "ok" || !routerSupportsIncrease || increaseSteps.length === 0}
              icon={<Plus className="h-4 w-4" />}
              onComplete={completeAndRefresh(position.isStaked && restakeAfter ? "Liquidity increased and restaked." : "Liquidity increased.")}
              onError={onError}
            >
              Preview and increase
            </TransactionFlowButton>
          </div>
        </form>
      ) : (
        <form onSubmit={removeFormik.handleSubmit} noValidate className="space-y-2.5 rounded-2xl border border-white/15 bg-black/10 p-4">
          <p className="text-xs text-white/50">Partially or fully withdraw the active position. Owed fees are collected in the same transaction.</p>
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_6.5rem] xl:items-end">
            <label className="block text-xs text-white/60">
              <span className="flex items-center justify-between gap-3">
                <span>Percentage</span>
                <span className="font-medium text-white">{numericPercent}%</span>
              </span>
              <input
                aria-label="Percentage of liquidity to remove"
                name="percent"
                type="range"
                min={1}
                max={100}
                step={1}
                value={Math.max(1, numericPercent)}
                onBlur={removeFormik.handleBlur}
                onChange={(event) => {
                  setPercent(event.target.value);
                  void removeFormik.setFieldValue("percent", event.target.value);
                }}
                className="mt-2 w-full accent-[var(--accent)]"
              />
            </label>
            <label className="block text-xs text-white/60">
              Slippage (%)
              <Input
                name="slippage"
                value={slippage}
                onBlur={removeFormik.handleBlur}
                onChange={(event) => {
                  setSlippage(event.target.value);
                  void removeFormik.setFieldValue("slippage", event.target.value);
                }}
                inputMode="decimal"
                className="mt-1 h-9"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {estimatedAmounts.map(([raw, token], index) => (
              <span key={index} className="truncate rounded-lg bg-white/5 px-2.5 py-2">Est. {amount(raw, token)}</span>
            ))}
          </div>
          {removingAll ? (
            <label className="flex items-center gap-2 border-t border-white/[0.07] pt-2.5 text-xs text-white/65">
              <input
                type="checkbox"
                checked={burnAfterRemove}
                onChange={(event) => setBurnAfterRemove(event.target.checked)}
              />
              Burn the empty position NFT in the same transaction
            </label>
          ) : null}
          {removeFormik.submitCount > 0 && (removeFormik.errors.percent || removeFormik.errors.slippage) ? (
            <p role="alert" className="text-xs text-red-200">{removeFormik.errors.percent ?? removeFormik.errors.slippage}</p>
          ) : null}
          <TransactionFlowButton
            ref={removeTransactionRef}
            type="submit"
            className="w-full"
            steps={removeSteps}
            disabled={deadline === null || removeLiquidity <= 0n || removeSteps.length === 0}
            onComplete={completeAndRefresh(
              removingAll
                ? burnAfterRemove
                  ? "Liquidity removed and empty NFT burned."
                  : "Liquidity fully removed. The NFT was not burned."
                : "Liquidity partially removed.",
            )}
            onError={onError}
          >
            Preview and remove
          </TransactionFlowButton>
        </form>
      )}

      {canBurn ? (
        <form onSubmit={burnFormik.handleSubmit} noValidate className="rounded-2xl border border-white/15 bg-black/10 p-4">
          <label className="flex items-start gap-2 text-xs text-white/65">
            <input
              name="burnConfirmed"
              type="checkbox"
              checked={burnConfirmed}
              onChange={(event) => {
                setBurnConfirmed(event.target.checked);
                void burnFormik.setFieldValue("burnConfirmed", event.target.checked);
              }}
            />
            I confirm this empty NFT should be permanently burned.
          </label>
          {burnFormik.submitCount > 0 && burnFormik.errors.burnConfirmed ? (
            <p role="alert" className="mt-2 text-xs text-red-200">{burnFormik.errors.burnConfirmed}</p>
          ) : null}
          <TransactionFlowButton
            ref={burnTransactionRef}
            type="submit"
            className="mt-2 w-full"
            variant="secondary"
            disabled={!burnConfirmed}
            steps={[withPortfolioDomains(makeAddressWriteStep({
              key: "liquidity-burn-position",
              label: "Burn empty position NFT",
              address: managerAddress,
              abi: managerAbi,
              variables: { functionName: "burn", args: [position.tokenId] },
            }) as TxStep, ["liquidity"])]}
            onComplete={completeAndRefresh("Empty position NFT burned.")}
            onError={onError}
          >
            <Trash2 className="h-4 w-4" /> Burn empty NFT
          </TransactionFlowButton>
        </form>
      ) : null}
    </div>
  );
}
