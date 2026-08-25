"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useChainId } from "wagmi";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";
import {
  getLiquidityId20GaugeDescriptors,
  makeId20ActivationGuardSteps,
  useId20GaugePositions,
} from "@/components/features/id20/use-id20-gauges";
import { getContractConfig } from "@/contracts/shared";
import { usePortfolioSummary } from "@/features/portfolio";
import { useChainDeadline } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { LiquidityRangeGraph } from "./liquidity-range-graph";
import { useSlipstreamPoolState } from "./liquidity-range-graph";
import { LiquidityTokenInput } from "./liquidity-token-input";
import {
  buildSlipstreamLiquidityQuote,
  type SlipstreamLiquidityQuote,
  type SlipstreamLiquiditySide,
} from "./slipstream-liquidity-quote";
import {
  buildLiquidityApprovalStep,
  buildLiquidityRouterCall,
  buildLiquiditySourceOptions,
  resolveSelectedLiquiditySource,
} from "./liquidity-source-routing";
import {
  buildPresetRange,
  formatDisplayPair,
  formatPriceLabel,
  getDisplayPriceRangeTicks,
  getDisplayTokenOrientation,
  getPoolTickBounds,
  normalizeTickRange,
  resolveSlipstreamPoolContractName,
  type SlipstreamPoolState,
  type SlipstreamRangePreset,
  parsePriceInputToTick,
  priceInputsForRange,
} from "./slipstream-adapter";

type LiquidityPoolKey = "BTC" | "MEZO";
type SelectedSourcesState = Record<SlipstreamLiquiditySide, string | null>;
type DraftAmountsState = Record<SlipstreamLiquiditySide, string>;
type PoolFormState = {
  rangeStrategy: SlipstreamRangePreset;
  selectedRange: { tickLower: number; tickUpper: number } | null;
  manualRangeInputs: { lower: string; upper: string };
  activeSide: SlipstreamLiquiditySide;
  draftAmounts: DraftAmountsState;
  selectedSourceIds: SelectedSourcesState;
};

type LiquidityPoolOption = {
  key: LiquidityPoolKey;
  label: string;
  available: boolean;
};

const DEFAULT_SLIPPAGE_BPS = 50n;

function createInitialPoolFormState(): Record<LiquidityPoolKey, PoolFormState> {
  return {
    BTC: {
      rangeStrategy: "balanced",
      selectedRange: null,
      manualRangeInputs: { lower: "", upper: "" },
      activeSide: "assetA",
      draftAmounts: { assetA: "", assetB: "" },
      selectedSourceIds: { assetA: null, assetB: null },
    },
    MEZO: {
      rangeStrategy: "balanced",
      selectedRange: null,
      manualRangeInputs: { lower: "", upper: "" },
      activeSide: "assetA",
      draftAmounts: { assetA: "", assetB: "" },
      selectedSourceIds: { assetA: null, assetB: null },
    },
  };
}

function poolButtonTone(selected: boolean) {
  return selected
    ? "border-[var(--accent)]/60 bg-[linear-gradient(180deg,rgba(196,160,106,0.16),rgba(196,160,106,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.03]";
}

function TokenMarkStack({ symbol }: { symbol: LiquidityPoolKey }) {
  const tokenImage = symbol === "BTC" ? "/tokens/BTC.png" : "/tokens/MEZO.png";

  return (
    <div className="relative h-12 w-12 shrink-0 sm:h-14 sm:w-14">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--accent)]/35 bg-[rgba(196,160,106,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-14 sm:w-14">
        <Image
          src={tokenImage}
          alt={`${symbol} token`}
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#0c1117] shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7">
        <Image
          src="/tokens/Aurove.png"
          alt="Aurove"
          width={28}
          height={28}
          className="h-6 w-6 object-contain sm:h-7 sm:w-7"
        />
      </div>
    </div>
  );
}

function normalizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const [whole, ...fractions] = normalized.split(".");

  if (fractions.length === 0) {
    return whole;
  }

  return `${whole}.${fractions.join("").slice(0, 18)}`;
}

function currentRangeLabel(pool: SlipstreamPoolState, range: { tickLower: number; tickUpper: number } | null) {
  if (!range) return "Unavailable";
  const { lowTick, highTick } = getDisplayPriceRangeTicks(pool, range);
  const lower = formatPriceLabel({ pool, tick: lowTick });
  const upper = formatPriceLabel({ pool, tick: highTick });
  return `${lower} to ${upper}`;
}

function quoteSummaryValue(value: bigint | null) {
  if (value === null) return "Unavailable";
  return formatCompactRawTokenAmount(value, 18, null);
}

function QuoteStat({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  testId?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p data-testid={testId} className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/48">{detail}</p>
    </div>
  );
}

export function AddLiquidityCard({ initialPool = "BTC" }: { initialPool?: LiquidityPoolKey }) {
  const transactionRef = useRef<TransactionFlowButtonHandle>(null);
  const chainId = useChainId();
  const { address: account } = useAccount();
  const { deadline } = useChainDeadline();
  const portfolio = usePortfolioSummary();
  const id20Gauges = useId20GaugePositions(chainId, account);
  const [selectedPoolState, setSelectedPoolState] = useState<LiquidityPoolKey>(initialPool);
  const [poolFormStateByKey, setPoolFormStateByKey] = useState<Record<LiquidityPoolKey, PoolFormState>>(
    () => createInitialPoolFormState(),
  );

  const poolOptions = useMemo<LiquidityPoolOption[]>(
    () => [
      {
        key: "BTC",
        label: "BTC pool",
        available: Boolean(getContractConfig(chainId, resolveSlipstreamPoolContractName("BTC"))?.address),
      },
      {
        key: "MEZO",
        label: "MEZO pool",
        available: Boolean(getContractConfig(chainId, resolveSlipstreamPoolContractName("MEZO"))?.address),
      },
    ],
    [chainId],
  );

  const availablePools = poolOptions.filter((pool) => pool.available);
  const selectedPool = availablePools.some((pool) => pool.key === selectedPoolState)
    ? selectedPoolState
    : availablePools[0]?.key ?? selectedPoolState;

  const pool = useSlipstreamPoolState(chainId, selectedPool);
  const requiredId20Gauges = useMemo(
    () => getLiquidityId20GaugeDescriptors(chainId, [pool.token0?.address, pool.token1?.address]),
    [chainId, pool.token0?.address, pool.token1?.address],
  );
  const inactiveRequiredId20s = useMemo(() => {
    const required = new Set(requiredId20Gauges.map((item) => item.id20Address.toLowerCase()));
    return id20Gauges.gauges.filter(
      (item) => required.has(item.id20Address.toLowerCase()) && !item.isActivated,
    );
  }, [id20Gauges.gauges, requiredId20Gauges]);
  const routerAddress = getContractConfig(chainId, "AuroveZapRouter")?.address ?? null;
  const ledgerAddress = getContractConfig(chainId, "Ledger")?.address;
  const formState = poolFormStateByKey[selectedPool];

  const currentRange = useMemo(() => {
    if (!pool.tickSpacing || pool.currentTick === null) return null;
    return formState.selectedRange ?? buildPresetRange("balanced", pool.currentTick, pool.tickSpacing);
  }, [formState.selectedRange, pool.currentTick, pool.tickSpacing]);

  const sourcesBySide = useMemo(
    () =>
      buildLiquiditySourceOptions({
        pool,
        portfolio: portfolio.data,
        veCollections: portfolio.domains.wallet.data?.veCollections ?? {},
        ledgerAddress,
      }),
    [ledgerAddress, portfolio.data, portfolio.domains.wallet.data?.veCollections, pool],
  );

  const selectedSourceA = useMemo(
    () => resolveSelectedLiquiditySource(sourcesBySide.assetA, formState.selectedSourceIds.assetA),
    [formState.selectedSourceIds.assetA, sourcesBySide.assetA],
  );
  const selectedSourceB = useMemo(
    () => resolveSelectedLiquiditySource(sourcesBySide.assetB, formState.selectedSourceIds.assetB),
    [formState.selectedSourceIds.assetB, sourcesBySide.assetB],
  );


  const quote = useMemo<SlipstreamLiquidityQuote>(() => {
    const activeAmountText = formState.draftAmounts[formState.activeSide];
    const activeToken = formState.activeSide === "assetA" ? pool.token0 : pool.token1;
    const activeAmountRaw = activeToken ? parseAmountRaw(activeAmountText, activeToken.decimals) ?? 0n : 0n;

    return buildSlipstreamLiquidityQuote({
      pool,
      range: currentRange,
      activeSide: formState.activeSide,
      activeAmountRaw,
      sourceA: selectedSourceA,
      sourceB: selectedSourceB,
      receiver: account ?? null,
      deadline,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    });
  }, [account, currentRange, deadline, formState.activeSide, formState.draftAmounts, pool, selectedSourceA, selectedSourceB]);

  const liquiditySteps = useCallback((): TxStep[] => {
    if (!routerAddress || !quote.routerPlan) {
      throw new Error("Liquidity inputs are incomplete.");
    }

    const plan = quote.routerPlan;
    const steps: TxStep[] = requiredId20Gauges.flatMap(makeId20ActivationGuardSteps);

    if (!isAddress(routerAddress)) {
      throw new Error("Liquidity router is not configured on this network.");
    }

    if (!selectedSourceA || !selectedSourceB) throw new Error("A liquidity source is missing.");
    const approvalA = buildLiquidityApprovalStep({ source: selectedSourceA, input: plan.inputA, routerAddress, suffix: "assetA" });
    const approvalB = buildLiquidityApprovalStep({ source: selectedSourceB, input: plan.inputB, routerAddress, suffix: "assetB" });
    if (approvalA) steps.push(approvalA);
    if (approvalB) steps.push(approvalB);

    const routerCall = buildLiquidityRouterCall(plan);

    steps.push(
      makeContractWriteStep({
        key: "liquidity-add",
        label: "Supply liquidity",
        displayLabelBtn: true,
        contractName: "AuroveZapRouter",
        variables: routerCall as never,
      }) as unknown as TxStep,
    );

    return steps;
  }, [quote.routerPlan, requiredId20Gauges, routerAddress, selectedSourceA, selectedSourceB]);
  const activeToken = formState.activeSide === "assetA" ? pool.token0 : pool.token1;
  const activeAmountSchema = Yup.string()
    .required("Enter an amount.")
    .test("valid-amount", "Enter a valid amount.", (value) =>
      Boolean(activeToken && value && (parseAmountRaw(value, activeToken.decimals) ?? 0n) > 0n),
    )
    .test("valid-quote", quote.errorMessage ?? "A valid liquidity quote is required.", () => quote.status === "ok");
  const formik = useFormik({
    initialValues: {
      assetA: formState.draftAmounts.assetA,
      assetB: formState.draftAmounts.assetB,
      lower: formState.manualRangeInputs.lower,
      upper: formState.manualRangeInputs.upper,
    },
    enableReinitialize: true,
    validationSchema: Yup.object({
      assetA: formState.activeSide === "assetA" ? activeAmountSchema : Yup.string(),
      assetB: formState.activeSide === "assetB" ? activeAmountSchema : Yup.string(),
      lower: Yup.string().required("Enter a low price.").test("low-price", "Enter a valid low price.", (value) =>
        Boolean(value && parsePriceInputToTick({ pool, value, bound: "lower" }) !== null),
      ),
      upper: Yup.string().required("Enter a high price.").test("high-price", "Enter a valid high price.", (value) =>
        Boolean(value && parsePriceInputToTick({ pool, value, bound: "upper" }) !== null),
      ),
    }),
    onSubmit: async () => transactionRef.current?.run(),
  });

  const currentTick = pool.currentTick;
  const currentPriceText =
    currentTick === null ? "Unavailable" : formatPriceLabel({ pool, tick: currentTick });
  const rangeLabel = currentRangeLabel(pool, currentRange);
  const rangeStartsInRange = quote.beginsInRange;
  const requiredInputSide: SlipstreamLiquiditySide | null =
    currentTick === null || currentRange === null
      ? null
      : currentTick < currentRange.tickLower
        ? "assetA"
        : currentTick >= currentRange.tickUpper
          ? "assetB"
          : null;
  const rangePresetLabel =
    formState.rangeStrategy === "focused"
      ? "Focused"
      : formState.rangeStrategy === "full-range"
        ? "Full range"
        : formState.rangeStrategy === "custom"
          ? "Custom"
          : "Balanced";

  const handleGraphSelection = useCallback(
    (selection: {
      range: { tickLower: number; tickUpper: number } | null;
      strategy: SlipstreamRangePreset;
    }) => {
      const nextManualRangeInputs = selection.range
        ? priceInputsForRange({ pool, range: selection.range })
        : null;
      const nextActiveSide =
        selection.range && pool.currentTick !== null
          ? pool.currentTick < selection.range.tickLower
            ? "assetA"
            : pool.currentTick >= selection.range.tickUpper
              ? "assetB"
              : null
          : null;

      setPoolFormStateByKey((current) => {
        const nextState = current[selectedPool];
        const currentRange = nextState.selectedRange;

        const hasSameRange =
          currentRange === selection.range ||
          (currentRange !== null &&
            selection.range !== null &&
            currentRange.tickLower === selection.range.tickLower &&
            currentRange.tickUpper === selection.range.tickUpper);

        const hasSameManualRangeInputs =
          nextManualRangeInputs === null ||
          (nextState.manualRangeInputs.lower === nextManualRangeInputs.lower &&
            nextState.manualRangeInputs.upper === nextManualRangeInputs.upper);
        const hasSameActiveSide = nextActiveSide === null || nextState.activeSide === nextActiveSide;

        if (
          hasSameRange &&
          hasSameManualRangeInputs &&
          hasSameActiveSide &&
          nextState.rangeStrategy === selection.strategy
        ) {
          return current;
        }

        return {
          ...current,
          [selectedPool]: {
            ...nextState,
            selectedRange: selection.range,
            manualRangeInputs: nextManualRangeInputs ?? nextState.manualRangeInputs,
            rangeStrategy: selection.strategy,
            activeSide: nextActiveSide ?? nextState.activeSide,
          },
        };
      });
    },
    [pool, selectedPool],
  );

  function handleAmountChange(side: SlipstreamLiquiditySide, value: string) {
    setPoolFormStateByKey((current) => ({
      ...current,
      [selectedPool]: {
        ...current[selectedPool],
        draftAmounts: {
          ...current[selectedPool].draftAmounts,
          [side]: value,
        },
        activeSide: side,
      },
    }));
  }

  function activateSide(side: SlipstreamLiquiditySide, seedValue?: string) {
    setPoolFormStateByKey((current) => {
      const next = current[selectedPool];
      if (seedValue === undefined) {
        return {
          ...current,
          [selectedPool]: {
            ...next,
            activeSide: side,
          },
        };
      }

      return {
        ...current,
        [selectedPool]: {
          ...next,
          activeSide: side,
          draftAmounts: next.draftAmounts[side]
            ? next.draftAmounts
            : {
                ...next.draftAmounts,
                [side]: seedValue,
              },
        },
      };
    });
  }

  function setMaxForSide(side: SlipstreamLiquiditySide) {
    const source = side === "assetA" ? selectedSourceA : selectedSourceB;
    const token = side === "assetA" ? pool.token0 : pool.token1;
    if (!source || !token) return;

    setPoolFormStateByKey((current) => ({
      ...current,
      [selectedPool]: {
        ...current[selectedPool],
        activeSide: side,
        draftAmounts: {
          ...current[selectedPool].draftAmounts,
          [side]: formatUnits(source.balanceRaw, token.decimals),
        },
      },
    }));
  }

  function selectSource(side: SlipstreamLiquiditySide, sourceId: string) {
    setPoolFormStateByKey((current) => ({
      ...current,
      [selectedPool]: {
        ...current[selectedPool],
        selectedSourceIds: {
          ...current[selectedPool].selectedSourceIds,
          [side]: sourceId,
        },
      },
    }));
  }

  function applyManualRange() {
    if (!pool.tickSpacing) return;

    const lowerTick = parsePriceInputToTick({ pool, value: formState.manualRangeInputs.lower, bound: "lower" });
    const upperTick = parsePriceInputToTick({ pool, value: formState.manualRangeInputs.upper, bound: "upper" });

    if (lowerTick === null || upperTick === null) return;

    const nextRange = normalizeTickRange(
      lowerTick < upperTick
        ? { tickLower: lowerTick, tickUpper: upperTick }
        : { tickLower: upperTick, tickUpper: lowerTick },
      pool.tickSpacing,
      getPoolTickBounds(pool.tickSpacing),
    );

    setPoolFormStateByKey((current) => ({
      ...current,
      [selectedPool]: {
        ...current[selectedPool],
        selectedRange: nextRange,
        manualRangeInputs: priceInputsForRange({ pool, range: nextRange }),
        rangeStrategy: "custom",
        activeSide:
          pool.currentTick !== null && pool.currentTick < nextRange.tickLower
            ? "assetA"
            : pool.currentTick !== null && pool.currentTick >= nextRange.tickUpper
              ? "assetB"
              : current[selectedPool].activeSide,
      },
    }));
  }

  function sideDisplayValue(side: SlipstreamLiquiditySide) {
    const token = side === "assetA" ? pool.token0 : pool.token1;
    if (!token) return "";

    if (formState.activeSide === side) {
      return formState.draftAmounts[side];
    }

    if (quote.status === "ok" || quote.status === "insufficient-balance" || quote.status === "unavailable-quote") {
      const usedRaw = side === "assetA" ? quote.amountAUsedRaw : quote.amountBUsedRaw;
      if (usedRaw !== null) {
        return formatUnits(usedRaw, token.decimals);
      }
    }

    return formState.draftAmounts[side];
  }

  const selectedSourceCount = [selectedSourceA, selectedSourceB].filter(Boolean).length;
  const displaySides: readonly SlipstreamLiquiditySide[] = getDisplayTokenOrientation(pool).inverted
    ? ["assetB", "assetA"]
    : ["assetA", "assetB"];
  const statusTone: Record<SlipstreamLiquidityQuote["status"], string> = {
    ok: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    "insufficient-balance": "border-rose-300/25 bg-rose-300/10 text-rose-100",
    "unsupported-input-combination": "border-amber-300/25 bg-amber-300/10 text-amber-100",
    "invalid-range": "border-rose-300/25 bg-rose-300/10 text-rose-100",
    "unavailable-quote": "border-white/15 bg-white/[0.04] text-white/70",
  };

  const statusLabel: Record<SlipstreamLiquidityQuote["status"], string> = {
    ok: "Ready",
    "insufficient-balance": "Insufficient balance",
    "unsupported-input-combination": "Unsupported source combo",
    "invalid-range": "Invalid range",
    "unavailable-quote": "Quote unavailable",
  };

  return (
    <Card className="relative overflow-hidden border border-white/12 bg-[linear-gradient(160deg,rgba(19,24,33,0.98),rgba(10,13,18,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,160,106,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,128,194,0.12),transparent_32%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(234,209,165,0.36),transparent)]"
      />

      <form onSubmit={formik.handleSubmit} noValidate>

      <CardHeader className="relative space-y-4 border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/35 bg-[linear-gradient(160deg,rgba(196,160,106,0.16),rgba(196,160,106,0.05))] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl sm:text-[1.35rem]">Add Liquidity</CardTitle>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)]">Editing</Badge>
            <button
              type="button"
              title="Choose the pool you want to add liquidity to."
              aria-label="Choose the pool you want to add liquidity to."
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/55 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06] hover:text-white"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <CardDescription>Select one pool to continue.</CardDescription>
      </CardHeader>

      <CardContent className="relative space-y-5 p-5 sm:p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <label className="font-medium text-white">Pool</label>
            <span className="text-white/45">
              {availablePools.length === 0 ? "No pools available" : `${availablePools.length} available`}
            </span>
          </div>

          <div id="liquidity-pool-selector" tabIndex={-1} className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            {poolOptions.map((poolOption) => {
              const selected = selectedPool === poolOption.key;

              return (
                <button
                  key={poolOption.key}
                  type="button"
                  onClick={() => setSelectedPoolState(poolOption.key)}
                  aria-pressed={selected}
                  disabled={!poolOption.available}
                  className={cn(
                    "flex min-h-16 items-center justify-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition sm:min-h-18 sm:justify-start",
                    poolButtonTone(selected),
                    !poolOption.available && "cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-transparent",
                  )}
                >
                  <TokenMarkStack symbol={poolOption.key} />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-base font-semibold text-white">{poolOption.key}</p>
                    <p className="text-xs text-white/45">{poolOption.label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <label className="font-medium text-white">Concentrated range</label>
            <span className="text-white/45">Slipstream adapter</span>
          </div>

          {availablePools.length > 0 ? (
            <LiquidityRangeGraph
              key={selectedPool}
              chainId={chainId}
              poolKey={selectedPool}
              selectedRange={formState.selectedRange}
              selectedStrategy={formState.rangeStrategy}
              onSelectionChange={handleGraphSelection}
            />
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
              No pool is currently available on this network.
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-white">Low price</label>
              <span className="text-xs text-white/40">
                {formatDisplayPair(pool)}
              </span>
            </div>
            <input
              name="lower"
              inputMode="decimal"
              value={formState.manualRangeInputs.lower}
              onChange={(event) => {
                const value = normalizeAmountInput(event.target.value);
                setPoolFormStateByKey((current) => ({
                  ...current,
                  [selectedPool]: {
                    ...current[selectedPool],
                    manualRangeInputs: {
                      ...current[selectedPool].manualRangeInputs,
                      lower: value,
                    },
                    rangeStrategy: "custom",
                  },
                }));
              }}
              placeholder="0.0000149"
              className="h-16 w-full rounded-2xl border border-white/10 bg-[#0d1319] px-4 text-2xl font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-[var(--accent)]/50"
            />
          </div>

          <div className="space-y-2 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-white">High price</label>
              <span className="text-xs text-white/40">
                {formatDisplayPair(pool)}
              </span>
            </div>
            <input
              name="upper"
              inputMode="decimal"
              value={formState.manualRangeInputs.upper}
              onChange={(event) => {
                const value = normalizeAmountInput(event.target.value);
                setPoolFormStateByKey((current) => ({
                  ...current,
                  [selectedPool]: {
                    ...current[selectedPool],
                    manualRangeInputs: {
                      ...current[selectedPool].manualRangeInputs,
                      upper: value,
                    },
                    rangeStrategy: "custom",
                  },
                }));
              }}
              placeholder="0.0000161"
              className="h-16 w-full rounded-2xl border border-white/10 bg-[#0d1319] px-4 text-2xl font-semibold text-white outline-none transition placeholder:text-white/20 focus:border-[var(--accent)]/50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-xs leading-5 text-white/46">
            Manual range uses {formatDisplayPair(pool)} pricing and snaps to the pool tick spacing when applied.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="h-10 rounded-full px-4"
            onClick={applyManualRange}
            disabled={
              parsePriceInputToTick({ pool, value: formState.manualRangeInputs.lower, bound: "lower" }) === null ||
              parsePriceInputToTick({ pool, value: formState.manualRangeInputs.upper, bound: "upper" }) === null ||
              !pool.tickSpacing
            }
          >
            Apply manual range
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {displaySides.map((side) => {
            const isAssetA = side === "assetA";
            const token = isAssetA ? pool.token0 : pool.token1;
            const source = isAssetA ? selectedSourceA : selectedSourceB;
            const sources = isAssetA ? sourcesBySide.assetA : sourcesBySide.assetB;
            const oppositeSide: SlipstreamLiquiditySide = isAssetA ? "assetB" : "assetA";

            return (
              <LiquidityTokenInput
                key={side}
                id={`liquidity-${side}`}
                name={side}
                tokenSymbol={token?.symbol ?? null}
                value={sideDisplayValue(side)}
                balanceLabel={source ? formatCompactRawTokenAmount(source.balanceRaw, source.decimals, token?.symbol ?? null) : "Unavailable"}
                isEditing={formState.activeSide === side}
                disabled={!source || requiredInputSide === oppositeSide}
                loading={!token || portfolio.isLoading}
                insufficientBalance={quote.status === "insufficient-balance" && formState.activeSide === side}
                canMax={Boolean(source && source.balanceRaw > 0n)}
                sources={sources}
                selectedSource={source}
                onFocus={() => activateSide(side, sideDisplayValue(side))}
                onChange={(value) => handleAmountChange(side, normalizeAmountInput(value))}
                onMax={() => setMaxForSide(side)}
                onSelectSource={(sourceId) => selectSource(side, sourceId)}
              />
            );
          })}
        </div>

        <div className="space-y-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--accent)]">
                  <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {rangePresetLabel}
                </Badge>
                <Badge className={cn("normal-case tracking-normal", statusTone[quote.status])}>
                  {statusLabel[quote.status]}
                </Badge>
              </div>
              <p className="text-sm text-white/55">
                {rangeLabel}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/45">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              {selectedSourceCount} source{selectedSourceCount === 1 ? "" : "s"} selected
            </div>
          </div>

          {quote.errorMessage ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-4 py-3 text-sm text-amber-50/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{quote.errorMessage}</p>
            </div>
          ) : null}

          {inactiveRequiredId20s.length > 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-sky-300/20 bg-sky-300/8 px-4 py-3 text-sm text-sky-50/90">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                Activate {inactiveRequiredId20s.map((item) => item.symbol).join(" and ")} rewards before
                supplying liquidity. Activation is included as the first transaction step and your form
                will stay intact.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <QuoteStat
              label="Liquidity"
              value={quoteSummaryValue(quote.liquidityRaw)}
              detail={quote.status === "ok" ? "Ready" : "Enter an amount to preview"}
            />
            <QuoteStat
              label="Price"
              value={currentPriceText}
              detail={rangePresetLabel}
              testId="add-liquidity-current-price"
            />
            <QuoteStat
              label="In range"
              value={rangeStartsInRange ? "Yes" : "No"}
              detail={currentTick === null ? "Waiting for pool" : `Tick ${currentTick.toString()}`}
            />
          </div>

          <TransactionFlowButton
            ref={transactionRef}
            type="submit"
            className="h-14 w-full justify-center rounded-2xl bg-[linear-gradient(180deg,#f1c46e,#d8a94f)] px-5 text-base font-semibold text-[#17130c] shadow-[0_16px_30px_rgba(216,169,79,0.22)] hover:bg-[linear-gradient(180deg,#f4ce84,#ddb45d)]"
            size="lg"
            disabled={quote.status !== "ok" || !quote.routerPlan || !routerAddress}
            icon={<ArrowRightLeft className="h-4 w-4" aria-hidden="true" />}
            renderStatusIcon={(state) => {
              if (state === "pending") {
                return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
              }
              if (state === "success") {
                return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
              }
              if (state === "error") {
                return <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
              }
              return null;
            }}
            steps={() => liquiditySteps()}
            onComplete={() => {
              void id20Gauges.refresh();
              Object.values(portfolio.domains).forEach((query) => void query.refetch());
            }}
          >
            Add liquidity
          </TransactionFlowButton>
        </div>
      </CardContent>
      </form>
    </Card>
  );
}
