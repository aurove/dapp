"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { erc20Abi, type Address, type PublicClient } from "viem";
import { Badge, Button, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { heavyReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { readNumber, readResult } from "@/lib/web3/value-parsers";
import { usePublicClient, useReadContracts } from "wagmi";
import {
  buildPresetRange,
  clampTickToBounds,
  formatDisplayPair,
  formatPriceLabel,
  formatTickPrice,
  getDisplayPriceOrientation,
  getDisplayPriceRangeTicks,
  getPoolTickBounds,
  getFullRangeHalfIntervals,
  getRangeMidpoint,
  getRangeTickCount,
  normalizeTickRange,
  resolveSlipstreamPoolContractName,
  SLIPSTREAM_RANGE_INTERVALS,
  type SlipstreamPoolState,
  type SlipstreamPoolKey,
  type SlipstreamRangePreset,
  type SlipstreamTickRange,
  type SlipstreamTokenInfo,
} from "./slipstream-adapter";
import {
  fetchSlipstreamLiquidityDepth,
  formatRawLiquidity,
  scaleLiquidityForChart,
  type SlipstreamLiquidityInterval,
} from "./slipstream-liquidity-depth";
import { slipstreamLiquidityDepthKeys } from "./slipstream-liquidity-depth-keys";

type LiquidityRangeGraphProps = {
  chainId: number;
  poolKey: SlipstreamPoolKey;
  selectedRange?: SlipstreamTickRange | null;
  selectedStrategy?: SlipstreamRangePreset;
  onSelectionChange?: (selection: {
    range: SlipstreamTickRange | null;
    strategy: SlipstreamRangePreset;
  }) => void;
};

type Size = {
  width: number;
  height: number;
};

const CHART_HEIGHT = 252;
const CHART_PADDING = {
  top: 16,
  right: 14,
  bottom: 34,
  left: 14,
};

const INITIAL_ZOOM_INTERVALS = SLIPSTREAM_RANGE_INTERVALS.balanced;
const MIN_VISIBLE_INTERVALS = 6;

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
      });
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function formatRangeText(range: SlipstreamTickRange, pool: SlipstreamPoolState) {
  const { lowTick, highTick } = getDisplayPriceRangeTicks(pool, range);
  const lower = formatPriceLabel({ pool, tick: lowTick });
  const upper = formatPriceLabel({ pool, tick: highTick });
  return { lower, upper };
}

function useSlipstreamPoolData(chainId: number, poolKey: SlipstreamPoolKey) {
  const contract = getContractConfig(chainId, resolveSlipstreamPoolContractName(poolKey));
  const poolAddress = contract?.address ?? null;
  const publicClient = usePublicClient({ chainId });
  const depthQuery = useQuery({
    queryKey: poolAddress
      ? slipstreamLiquidityDepthKeys.pool(chainId, poolAddress)
      : [...slipstreamLiquidityDepthKeys.chain(chainId), poolKey, "unavailable"],
    queryFn: () => {
      if (!poolAddress || !contract?.abi || !publicClient) {
        throw new Error("The concentrated-liquidity pool is unavailable on this network.");
      }
      return fetchSlipstreamLiquidityDepth({
        client: publicClient as PublicClient,
        chainId,
        poolAddress,
        poolAbi: contract.abi,
      });
    },
    ...heavyReadQueryOptions,
    enabled: Boolean(poolAddress && contract?.abi && publicClient),
  });
  const rawToken0 = depthQuery.data?.token0 ?? null;
  const rawToken1 = depthQuery.data?.token1 ?? null;

  const tokenMetaReads = useReadContracts({
    allowFailure: true,
    contracts:
      rawToken0 && rawToken1
        ? [
            {
              address: rawToken0,
              abi: erc20Abi,
              functionName: "symbol",
            },
            {
              address: rawToken0,
              abi: erc20Abi,
              functionName: "name",
            },
            {
              address: rawToken0,
              abi: erc20Abi,
              functionName: "decimals",
            },
            {
              address: rawToken1,
              abi: erc20Abi,
              functionName: "symbol",
            },
            {
              address: rawToken1,
              abi: erc20Abi,
              functionName: "name",
            },
            {
              address: rawToken1,
              abi: erc20Abi,
              functionName: "decimals",
            },
          ]
        : [],
    query: {
      ...staticReadQueryOptions,
      enabled: Boolean(rawToken0 && rawToken1),
    },
  });

  const token0 = useMemo<SlipstreamTokenInfo | null>(() => {
    if (!rawToken0) return null;
    const decimals = readNumber(readResult(tokenMetaReads.data, 2));
    if (decimals === null) return null;
    return {
      address: rawToken0,
      symbol: (readResult<string>(tokenMetaReads.data, 0) ?? null)?.trim() || null,
      name: (readResult<string>(tokenMetaReads.data, 1) ?? null)?.trim() || null,
      decimals,
    };
  }, [rawToken0, tokenMetaReads.data]);

  const token1 = useMemo<SlipstreamTokenInfo | null>(() => {
    if (!rawToken1) return null;
    const decimals = readNumber(readResult(tokenMetaReads.data, 5));
    if (decimals === null) return null;
    return {
      address: rawToken1,
      symbol: (readResult<string>(tokenMetaReads.data, 3) ?? null)?.trim() || null,
      name: (readResult<string>(tokenMetaReads.data, 4) ?? null)?.trim() || null,
      decimals,
    };
  }, [rawToken1, tokenMetaReads.data]);

  const pool = useMemo<SlipstreamPoolState>(
    () => ({
      chainId,
      address: poolAddress ?? ("0x0000000000000000000000000000000000000000" as Address),
      token0,
      token1,
      currentTick: depthQuery.data?.currentTick ?? null,
      sqrtPriceX96: depthQuery.data?.sqrtPriceX96 ?? null,
      tickSpacing: depthQuery.data?.tickSpacing ?? null,
    }),
    [chainId, depthQuery.data, poolAddress, token0, token1],
  );

  return { pool, depthQuery };
}

export function useSlipstreamPoolState(chainId: number, poolKey: SlipstreamPoolKey) {
  return useSlipstreamPoolData(chainId, poolKey).pool;
}

function classForPreset(selected: boolean) {
  return selected
    ? "border-[var(--accent)]/50 bg-[linear-gradient(180deg,rgba(196,160,106,0.16),rgba(196,160,106,0.08))] text-white"
    : "border-white/10 bg-white/[0.03] text-white/68 hover:border-white/15 hover:bg-white/[0.05] hover:text-white";
}

export function LiquidityRangeGraph({
  chainId,
  poolKey,
  selectedRange: controlledSelectedRange,
  selectedStrategy: controlledSelectedStrategy,
  onSelectionChange,
}: LiquidityRangeGraphProps) {
  const { pool, depthQuery } = useSlipstreamPoolData(chainId, poolKey);
  const { ref: chartRef, size } = useElementSize<HTMLDivElement>();

  const [strategy, setStrategy] = useState<SlipstreamRangePreset>("balanced");
  const [selection, setSelection] = useState<SlipstreamTickRange | null>(null);
  const [viewportCenterTick, setViewportCenterTick] = useState<number | null>(null);
  const [viewportHalfIntervals, setViewportHalfIntervals] = useState<number | null>(null);
  const [hoveredInterval, setHoveredInterval] = useState<SlipstreamLiquidityInterval | null>(null);
  const defaultSelection = useMemo(() => {
    if (!pool.tickSpacing || pool.currentTick === null) return null;
    return buildPresetRange("balanced", pool.currentTick, pool.tickSpacing);
  }, [pool.currentTick, pool.tickSpacing]);
  const selectedRange = controlledSelectedRange ?? selection ?? defaultSelection;
  const activeStrategy: SlipstreamRangePreset =
    controlledSelectedStrategy ?? (selection ? strategy : "balanced");
  const bounds = useMemo(
    () => (pool.tickSpacing ? getPoolTickBounds(pool.tickSpacing) : null),
    [pool.tickSpacing],
  );
  const normalizedSelectedRange = useMemo(() => {
    if (!pool.tickSpacing || !selectedRange) return null;
    return normalizeTickRange(
      selectedRange,
      pool.tickSpacing,
      bounds ?? getPoolTickBounds(pool.tickSpacing),
    );
  }, [bounds, pool.tickSpacing, selectedRange]);

  const visibleRange = useMemo(() => {
    if (!pool.tickSpacing) return null;
    const centerTick =
      viewportCenterTick ??
      getRangeMidpoint(
        normalizedSelectedRange ??
          defaultSelection ?? {
            tickLower: 0,
            tickUpper: pool.tickSpacing,
          },
      );
    if (centerTick === null || !Number.isFinite(centerTick)) return null;

    const halfIntervals = Math.max(
      MIN_VISIBLE_INTERVALS,
      viewportHalfIntervals ?? INITIAL_ZOOM_INTERVALS,
    );
    const visible = normalizeTickRange(
      {
        tickLower: centerTick - halfIntervals * pool.tickSpacing,
        tickUpper: centerTick + halfIntervals * pool.tickSpacing,
      },
      pool.tickSpacing,
      bounds ?? getPoolTickBounds(pool.tickSpacing),
    );

    return visible;
  }, [
    bounds,
    defaultSelection,
    normalizedSelectedRange,
    pool.tickSpacing,
    viewportCenterTick,
    viewportHalfIntervals,
  ]);

  const visibleIntervals = useMemo(() => {
    if (!visibleRange || !depthQuery.data) return [];
    return depthQuery.data.intervals.filter(
      (interval) =>
        interval.tickUpper > visibleRange.tickLower && interval.tickLower < visibleRange.tickUpper,
    );
  }, [depthQuery.data, visibleRange]);
  const maxLiquidity = useMemo(
    () =>
      visibleIntervals.reduce(
        (max, interval) => (interval.liquidity > max ? interval.liquidity : max),
        0n,
      ),
    [visibleIntervals],
  );
  const priceOrientation = getDisplayPriceOrientation(pool);

  const innerWidth = Math.max(0, size.width - CHART_PADDING.left - CHART_PADDING.right);
  const innerHeight = Math.max(0, CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom);
  const xScale = useMemo(() => {
    if (!visibleRange) return null;

    return scaleLinear<number>({
      domain: [visibleRange.tickLower, visibleRange.tickUpper],
      range: priceOrientation.inverted
        ? [CHART_PADDING.left + innerWidth, CHART_PADDING.left]
        : [CHART_PADDING.left, CHART_PADDING.left + innerWidth],
      clamp: true,
    });
  }, [innerWidth, priceOrientation.inverted, visibleRange]);

  const yScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [0, 1_000_000],
      range: [CHART_PADDING.top + innerHeight, CHART_PADDING.top],
      clamp: true,
    });
  }, [innerHeight]);

  const currentTick = pool.currentTick;
  const currentTickInRange =
    currentTick !== null && visibleRange
      ? currentTick >= visibleRange.tickLower && currentTick <= visibleRange.tickUpper
      : false;

  const currentX = currentTick !== null && xScale ? xScale(currentTick) : null;
  const renderedRange = normalizedSelectedRange ?? selectedRange;
  const renderedDisplayTicks = renderedRange
    ? getDisplayPriceRangeTicks(pool, renderedRange)
    : null;
  const selectedLowerX =
    renderedDisplayTicks && xScale ? xScale(renderedDisplayTicks.lowTick) : null;
  const selectedUpperX =
    renderedDisplayTicks && xScale ? xScale(renderedDisplayTicks.highTick) : null;
  const fullRangeHalfIntervals = useMemo(
    () => (pool.tickSpacing ? getFullRangeHalfIntervals(pool.tickSpacing) : INITIAL_ZOOM_INTERVALS),
    [pool.tickSpacing],
  );

  const presetLabel =
    activeStrategy === "custom"
      ? "Custom"
      : activeStrategy === "full-range"
        ? "Full range"
        : activeStrategy === "focused"
          ? "Focused"
          : "Balanced";

  function commitSelection(nextRange: SlipstreamTickRange, nextStrategy: SlipstreamRangePreset) {
    if (!pool.tickSpacing) return;

    const normalized = normalizeTickRange(
      nextRange,
      pool.tickSpacing,
      bounds ?? getPoolTickBounds(pool.tickSpacing),
    );
    setSelection(normalized);
    setStrategy(nextStrategy);
    onSelectionChange?.({ range: normalized, strategy: nextStrategy });
    setViewportCenterTick(getRangeMidpoint(normalized));

    const neededHalfIntervals = Math.ceil(getRangeTickCount(normalized, pool.tickSpacing) / 2) + 2;
    setViewportHalfIntervals((current) =>
      Math.max(
        nextStrategy === "full-range"
          ? fullRangeHalfIntervals
          : (current ?? INITIAL_ZOOM_INTERVALS),
        neededHalfIntervals,
      ),
    );
  }

  function updateUnderlyingHandle(handle: "lower" | "upper", tick: number) {
    if (!pool.tickSpacing || !selectedRange) return;

    const usableTick = clampTickToBounds(
      tick,
      bounds?.minUsable ?? tick,
      bounds?.maxUsable ?? tick,
    );

    const nextRange =
      handle === "lower"
        ? {
            tickLower: Math.min(usableTick, selectedRange.tickUpper - pool.tickSpacing),
            tickUpper: selectedRange.tickUpper,
          }
        : {
            tickLower: selectedRange.tickLower,
            tickUpper: Math.max(usableTick, selectedRange.tickLower + pool.tickSpacing),
          };

    commitSelection(nextRange, "custom");
  }

  function updateDisplayHandle(handle: "lower" | "upper", tick: number) {
    const underlyingHandle = priceOrientation.inverted
      ? handle === "lower"
        ? "upper"
        : "lower"
      : handle;
    updateUnderlyingHandle(underlyingHandle, tick);
  }

  function handleRangeKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    handle: "lower" | "upper",
  ) {
    if (!pool.tickSpacing || !selectedRange) return;

    const step = event.shiftKey ? pool.tickSpacing * 4 : pool.tickSpacing;
    const underlyingHandle = priceOrientation.inverted
      ? handle === "lower"
        ? "upper"
        : "lower"
      : handle;
    const currentHandleTick =
      underlyingHandle === "lower" ? selectedRange.tickLower : selectedRange.tickUpper;
    let nextTick: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextTick = currentHandleTick + (priceOrientation.inverted ? step : -step);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextTick = currentHandleTick + (priceOrientation.inverted ? -step : step);
    } else if (event.key === "Home") {
      nextTick = priceOrientation.inverted
        ? (bounds?.maxUsable ?? null)
        : (bounds?.minUsable ?? null);
    } else if (event.key === "End") {
      nextTick = priceOrientation.inverted
        ? (bounds?.minUsable ?? null)
        : (bounds?.maxUsable ?? null);
    }

    if (nextTick === null) return;

    event.preventDefault();
    updateDisplayHandle(handle, nextTick);
  }

  function onDragStart(handle: "lower" | "upper") {
    const tickSpacing = pool.tickSpacing;
    if (!chartRef.current || !tickSpacing || !selectedRange || !visibleRange || !xScale) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = chartRef.current?.getBoundingClientRect();
      if (!rect) return;

      const innerLeft = rect.left + CHART_PADDING.left;
      const innerRight = rect.right - CHART_PADDING.right;
      const boundedX = Math.min(innerRight, Math.max(innerLeft, event.clientX));
      const rawTick = xScale.invert(boundedX - rect.left);
      const snapped = Math.round(rawTick / tickSpacing) * tickSpacing;

      updateDisplayHandle(handle, snapped);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function setPreset(preset: Exclude<SlipstreamRangePreset, "custom">) {
    if (pool.currentTick === null || !pool.tickSpacing) return;

    const nextRange = buildPresetRange(preset, pool.currentTick, pool.tickSpacing);
    commitSelection(nextRange, preset);
    setViewportHalfIntervals(
      preset === "focused"
        ? SLIPSTREAM_RANGE_INTERVALS.focused
        : preset === "balanced"
          ? SLIPSTREAM_RANGE_INTERVALS.balanced
          : fullRangeHalfIntervals,
    );
  }

  function zoomViewport(direction: "in" | "out") {
    if (!pool.tickSpacing) return;

    setViewportHalfIntervals((current) => {
      const base = current ?? INITIAL_ZOOM_INTERVALS;
      const next =
        direction === "in"
          ? Math.max(MIN_VISIBLE_INTERVALS, Math.round(base * 0.82))
          : Math.min(fullRangeHalfIntervals, Math.max(base + 1, Math.round(base * 1.22)));
      return next;
    });
  }

  const rangeText = renderedRange && pool ? formatRangeText(renderedRange, pool) : null;
  const currentPriceText =
    currentTick !== null && pool.token0 && pool.token1
      ? formatPriceLabel({ pool, tick: currentTick })
      : null;
  const activeSelectedRange = renderedRange ?? visibleRange;
  const depthError =
    depthQuery.error instanceof Error
      ? depthQuery.error.message
      : depthQuery.error
        ? "The pool liquidity snapshot could not be loaded."
        : null;
  const leftVisibleTick = visibleRange
    ? priceOrientation.inverted
      ? visibleRange.tickUpper
      : visibleRange.tickLower
    : null;
  const rightVisibleTick = visibleRange
    ? priceOrientation.inverted
      ? visibleRange.tickLower
      : visibleRange.tickUpper
    : null;
  const hasVisibleLiquidity = visibleIntervals.some((interval) => interval.liquidity > 0n);
  const hoveredDisplayTicks = hoveredInterval
    ? getDisplayPriceRangeTicks(pool, hoveredInterval)
    : null;
  const hoveredIsSelected = Boolean(
    hoveredInterval &&
    activeSelectedRange &&
    hoveredInterval.tickUpper > activeSelectedRange.tickLower &&
    hoveredInterval.tickLower < activeSelectedRange.tickUpper,
  );
  const hoveredIsCurrent = Boolean(
    hoveredInterval &&
    currentTick !== null &&
    currentTick >= hoveredInterval.tickLower &&
    currentTick < hoveredInterval.tickUpper,
  );

  useEffect(() => {
    if (controlledSelectedRange !== null && controlledSelectedRange !== undefined) return;
    if (selection !== null || !defaultSelection) return;

    onSelectionChange?.({
      range: defaultSelection,
      strategy: controlledSelectedStrategy ?? "balanced",
    });
  }, [
    controlledSelectedRange,
    controlledSelectedStrategy,
    defaultSelection,
    onSelectionChange,
    selection,
  ]);

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">Price range</p>
            <Badge className="border-white/10 bg-white/[0.04] text-white/70">{presetLabel}</Badge>
            {depthQuery.data?.status === "complete" ? (
              <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-100">
                On-chain liquidity
              </Badge>
            ) : depthQuery.data?.status === "partial" ? (
              <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">
                Partial on-chain data
              </Badge>
            ) : depthError ? (
              <Badge className="border-rose-300/20 bg-rose-300/10 text-rose-100">Unavailable</Badge>
            ) : (
              <Badge className="border-white/10 bg-white/[0.04] text-white/55">
                Loading pool depth
              </Badge>
            )}
          </div>
          <p className="text-xs text-white/45">{formatDisplayPair(pool)}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => zoomViewport("out")}
            aria-label="Zoom out the visible chart range"
          >
            -
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => zoomViewport("in")}
            aria-label="Zoom in the visible chart range"
          >
            +
          </Button>
        </div>
      </div>

      <div
        ref={chartRef}
        data-testid="cl-liquidity-depth-chart"
        data-liquidity-source={depthQuery.data ? "on-chain" : "unavailable"}
        data-snapshot-block={depthQuery.data?.blockNumber.toString()}
        className="relative h-[252px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#090d13]"
      >
        {size.width > 0 &&
        xScale !== null &&
        yScale !== null &&
        visibleRange !== null &&
        depthQuery.data ? (
          <>
            <svg
              width={size.width}
              height={CHART_HEIGHT}
              role="img"
              aria-label="Concentrated liquidity distribution"
            >
              <defs>
                <linearGradient id="liquidity-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(196,160,106,0.92)" />
                  <stop offset="100%" stopColor="rgba(196,160,106,0.06)" />
                </linearGradient>
              </defs>

              <Group>
                <rect
                  x={CHART_PADDING.left}
                  y={CHART_PADDING.top}
                  width={innerWidth}
                  height={innerHeight}
                  rx={18}
                  fill="rgba(255,255,255,0.02)"
                />

                {selectedLowerX !== null && selectedUpperX !== null ? (
                  <rect
                    data-testid="proposed-liquidity-range-overlay"
                    x={Math.min(selectedLowerX, selectedUpperX)}
                    y={CHART_PADDING.top}
                    width={Math.abs(selectedUpperX - selectedLowerX)}
                    height={innerHeight}
                    fill="rgba(84,140,255,0.14)"
                  />
                ) : null}

                {visibleIntervals.map((interval) => {
                  const clippedLower = Math.max(interval.tickLower, visibleRange.tickLower);
                  const clippedUpper = Math.min(interval.tickUpper, visibleRange.tickUpper);
                  const lowerX = xScale(clippedLower);
                  const upperX = xScale(clippedUpper);
                  const x = Math.min(lowerX, upperX);
                  const width = Math.max(1, Math.abs(upperX - lowerX));
                  const chartLiquidity = scaleLiquidityForChart(interval.liquidity, maxLiquidity);
                  const barY = yScale(chartLiquidity);
                  const barHeight = Math.max(0, CHART_PADDING.top + innerHeight - barY);
                  const intervalDisplayTicks = getDisplayPriceRangeTicks(pool, {
                    tickLower: interval.tickLower,
                    tickUpper: interval.tickUpper,
                  });
                  const isSelected = Boolean(
                    activeSelectedRange &&
                    interval.tickUpper > activeSelectedRange.tickLower &&
                    interval.tickLower < activeSelectedRange.tickUpper,
                  );
                  const isCurrent =
                    currentTick !== null &&
                    currentTick >= interval.tickLower &&
                    currentTick < interval.tickUpper;
                  const accessibleLabel = [
                    `Ticks ${interval.tickLower} to ${interval.tickUpper}`,
                    `existing active pool liquidity ${interval.liquidity.toString()}`,
                    `user-selected range ${isSelected ? "yes" : "no"}`,
                    `current price interval ${isCurrent ? "yes" : "no"}`,
                  ].join(", ");

                  return (
                    <g
                      key={`${interval.tickLower}-${interval.tickUpper}`}
                      tabIndex={0}
                      role="img"
                      aria-label={accessibleLabel}
                      onPointerEnter={() => setHoveredInterval(interval)}
                      onPointerLeave={() => setHoveredInterval(null)}
                      onFocus={() => setHoveredInterval(interval)}
                      onBlur={() => setHoveredInterval(null)}
                    >
                      <title>{accessibleLabel}</title>
                      <rect
                        x={x}
                        y={CHART_PADDING.top}
                        width={width}
                        height={innerHeight}
                        fill="transparent"
                      />
                      {interval.liquidity > 0n ? (
                        <rect
                          x={x}
                          y={barY}
                          width={width}
                          height={barHeight}
                          fill="url(#liquidity-fill)"
                          stroke="rgba(196,160,106,0.32)"
                          strokeWidth={0.75}
                        />
                      ) : null}
                      <desc>
                        {formatPriceLabel({ pool, tick: intervalDisplayTicks.lowTick })} to{" "}
                        {formatPriceLabel({ pool, tick: intervalDisplayTicks.highTick })}
                      </desc>
                    </g>
                  );
                })}

                {currentX !== null && currentTickInRange ? (
                  <>
                    <line
                      x1={currentX}
                      x2={currentX}
                      y1={CHART_PADDING.top}
                      y2={CHART_PADDING.top + innerHeight}
                      stroke="rgba(255,255,255,0.72)"
                      strokeDasharray="4 6"
                    />
                    <circle cx={currentX} cy={CHART_PADDING.top + 8} r={4.5} fill="#f3dfb9" />
                  </>
                ) : null}

                {selectedLowerX !== null ? (
                  <line
                    x1={selectedLowerX}
                    x2={selectedLowerX}
                    y1={CHART_PADDING.top + 8}
                    y2={CHART_PADDING.top + innerHeight - 8}
                    stroke="rgba(84,140,255,0.85)"
                    strokeWidth={2}
                  />
                ) : null}
                {selectedUpperX !== null ? (
                  <line
                    x1={selectedUpperX}
                    x2={selectedUpperX}
                    y1={CHART_PADDING.top + 8}
                    y2={CHART_PADDING.top + innerHeight - 8}
                    stroke="rgba(84,140,255,0.85)"
                    strokeWidth={2}
                  />
                ) : null}
              </Group>
            </svg>

            <div className="pointer-events-none absolute left-3 top-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/38">
              Raw active liquidity
            </div>

            {hoveredInterval && hoveredDisplayTicks ? (
              <div className="pointer-events-none absolute right-3 top-3 z-30 max-w-[min(19rem,calc(100%-1.5rem))] rounded-xl border border-white/12 bg-[#10151d]/95 px-3 py-2 text-[11px] leading-5 text-white/68 shadow-2xl backdrop-blur">
                <p className="font-medium text-white">
                  Tick {hoveredInterval.tickLower} → {hoveredInterval.tickUpper}
                </p>
                <p>
                  Price: {formatPriceLabel({ pool, tick: hoveredDisplayTicks.lowTick })} →{" "}
                  {formatPriceLabel({ pool, tick: hoveredDisplayTicks.highTick })}
                </p>
                <p>
                  Existing active pool liquidity: {formatRawLiquidity(hoveredInterval.liquidity)}
                </p>
                <p>
                  User-selected range:{" "}
                  {hoveredIsSelected ? "overlaps this interval" : "outside this interval"}
                </p>
                <p>
                  Current price:{" "}
                  {hoveredIsCurrent
                    ? (currentPriceText ?? "in this interval")
                    : "not in this interval"}
                </p>
              </div>
            ) : null}

            {selectedLowerX !== null && activeSelectedRange ? (
              <button
                type="button"
                role="slider"
                aria-label="Drag lower range handle"
                aria-orientation="horizontal"
                aria-valuemin={bounds?.minUsable ?? activeSelectedRange.tickLower}
                aria-valuemax={bounds?.maxUsable ?? activeSelectedRange.tickUpper}
                aria-valuenow={renderedDisplayTicks?.lowTick ?? activeSelectedRange.tickLower}
                aria-valuetext={rangeText?.lower ?? `${activeSelectedRange.tickLower}`}
                className="absolute top-0 z-20 flex h-full w-10 -translate-x-1/2 items-center justify-center"
                style={{ left: selectedLowerX }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onDragStart("lower");
                }}
                onKeyDown={(event) => handleRangeKeyDown(event, "lower")}
              >
                <span className="flex h-10 w-3 items-center justify-center rounded-full border border-[rgba(196,160,106,0.38)] bg-[rgba(8,12,18,0.96)] shadow-[0_10px_24px_rgba(0,0,0,0.42)]">
                  <span className="h-5 w-1 rounded-full bg-[var(--accent)]/90" />
                </span>
              </button>
            ) : null}

            {selectedUpperX !== null && activeSelectedRange ? (
              <button
                type="button"
                role="slider"
                aria-label="Drag upper range handle"
                aria-orientation="horizontal"
                aria-valuemin={bounds?.minUsable ?? activeSelectedRange.tickLower}
                aria-valuemax={bounds?.maxUsable ?? activeSelectedRange.tickUpper}
                aria-valuenow={renderedDisplayTicks?.highTick ?? activeSelectedRange.tickUpper}
                aria-valuetext={rangeText?.upper ?? `${activeSelectedRange.tickUpper}`}
                className="absolute top-0 z-20 flex h-full w-10 -translate-x-1/2 items-center justify-center"
                style={{ left: selectedUpperX }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onDragStart("upper");
                }}
                onKeyDown={(event) => handleRangeKeyDown(event, "upper")}
              >
                <span className="flex h-10 w-3 items-center justify-center rounded-full border border-[rgba(196,160,106,0.38)] bg-[rgba(8,12,18,0.96)] shadow-[0_10px_24px_rgba(0,0,0,0.42)]">
                  <span className="h-5 w-1 rounded-full bg-[var(--accent)]/90" />
                </span>
              </button>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3 text-[11px] text-white/40">
              <span>
                {leftVisibleTick === null
                  ? "—"
                  : (formatTickPrice({ pool, tick: leftVisibleTick }) ?? `Tick ${leftVisibleTick}`)}
              </span>
              <span data-testid="depth-chart-current-price" className="text-white/55">
                {currentPriceText ?? "Current price unavailable"}
              </span>
              <span>
                {rightVisibleTick === null
                  ? "—"
                  : (formatTickPrice({ pool, tick: rightVisibleTick }) ??
                    `Tick ${rightVisibleTick}`)}
              </span>
            </div>

            {!hasVisibleLiquidity ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-12 text-center text-xs text-white/48">
                Zero active pool liquidity in this viewport.
              </div>
            ) : null}
          </>
        ) : null}

        {depthError ? (
          <div
            role="status"
            className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-100/78"
          >
            Pool liquidity data is unavailable. {depthError}
          </div>
        ) : size.width === 0 || !xScale || !yScale || !visibleRange || !depthQuery.data ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/45">
            Loading initialized ticks and active liquidity...
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs text-white/60">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Lower: {rangeText?.lower ?? "Unavailable"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Upper: {rangeText?.upper ?? "Unavailable"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
              Current tick: {currentTick ?? "Unavailable"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-white/42">
            Gold depth is raw active pool liquidity reconstructed between initialized ticks. Blue is
            only your proposed range. Handles snap to pool tick spacing; zoom changes only the
            viewport.
          </p>
          {depthQuery.data?.status === "partial" ? (
            <p role="status" className="text-xs leading-relaxed text-amber-100/72">
              Partial data: ticks outside {depthQuery.data.coverage.tickLower} to{" "}
              {depthQuery.data.coverage.tickUpper} were not loaded and are not represented.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn("min-w-20", classForPreset(activeStrategy === "focused"))}
            onClick={() => setPreset("focused")}
          >
            Focused
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn("min-w-20", classForPreset(activeStrategy === "balanced"))}
            onClick={() => setPreset("balanced")}
          >
            Balanced
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn("min-w-20", classForPreset(activeStrategy === "full-range"))}
            onClick={() => setPreset("full-range")}
          >
            Full range
          </Button>
        </div>
      </div>
    </div>
  );
}
