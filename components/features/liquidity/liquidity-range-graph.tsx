"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { erc20Abi, type Address } from "viem";
import { Badge, Button, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { readAddress, readNumber, readResult } from "@/lib/web3/value-parsers";
import { useReadContracts } from "wagmi";
import {
  buildFallbackLiquiditySeries,
  buildLiquiditySeries,
  buildPresetRange,
  clampTickToBounds,
  formatPriceLabel,
  getPoolTickBounds,
  getFullRangeHalfIntervals,
  getRangeMidpoint,
  getRangeTickCount,
  SLIPSTREAM_POOL_READ_ABI,
  normalizeTickRange,
  shortenAddress,
  resolveSlipstreamPoolContractName,
  SLIPSTREAM_RANGE_INTERVALS,
  type SlipstreamLiquiditySeries,
  type SlipstreamPoolState,
  type SlipstreamPoolKey,
  type SlipstreamRangePreset,
  type SlipstreamTickRange,
  type SlipstreamTokenInfo,
} from "./slipstream-adapter";

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
  const lower = formatPriceLabel({ pool, tick: range.tickLower });
  const upper = formatPriceLabel({ pool, tick: range.tickUpper });
  return { lower, upper };
}

function readTupleTick(value: unknown) {
  if (Array.isArray(value)) {
    return {
      sqrtPriceX96: value[0] as bigint | null,
      tick: readNumber(value[1]) ?? null,
    };
  }

  if (value && typeof value === "object") {
    const tuple = value as { sqrtPriceX96?: unknown; tick?: unknown };
    return {
      sqrtPriceX96: typeof tuple.sqrtPriceX96 === "bigint" ? tuple.sqrtPriceX96 : null,
      tick: readNumber(tuple.tick) ?? null,
    };
  }

  return { sqrtPriceX96: null, tick: null };
}

export function useSlipstreamPoolState(chainId: number, poolKey: SlipstreamPoolKey) {
  const contract = getContractConfig(chainId, resolveSlipstreamPoolContractName(poolKey));
  const poolAddress = contract?.address ?? null;

  const poolReads = useReadContracts({
    allowFailure: true,
    contracts:
      poolAddress
        ? [
            {
              address: poolAddress,
              abi: SLIPSTREAM_POOL_READ_ABI,
              functionName: "token0",
            },
            {
              address: poolAddress,
              abi: SLIPSTREAM_POOL_READ_ABI,
              functionName: "token1",
            },
            {
              address: poolAddress,
              abi: SLIPSTREAM_POOL_READ_ABI,
              functionName: "slot0",
            },
            {
              address: poolAddress,
              abi: SLIPSTREAM_POOL_READ_ABI,
              functionName: "tickSpacing",
            },
          ]
        : [],
    query: {
      ...staticReadQueryOptions,
      enabled: Boolean(poolAddress),
    },
  });

  const rawToken0 = readAddress(readResult(poolReads.data, 0));
  const rawToken1 = readAddress(readResult(poolReads.data, 1));
  const slot0 = readTupleTick(readResult(poolReads.data, 2));
  const tickSpacing = readNumber(readResult(poolReads.data, 3));

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
    return {
      address: rawToken0,
      symbol: (readResult<string>(tokenMetaReads.data, 0) ?? null)?.trim() || null,
      name: (readResult<string>(tokenMetaReads.data, 1) ?? null)?.trim() || null,
      decimals: readNumber(readResult(tokenMetaReads.data, 2)) ?? 18,
    };
  }, [rawToken0, tokenMetaReads.data]);

  const token1 = useMemo<SlipstreamTokenInfo | null>(() => {
    if (!rawToken1) return null;
    return {
      address: rawToken1,
      symbol: (readResult<string>(tokenMetaReads.data, 3) ?? null)?.trim() || null,
      name: (readResult<string>(tokenMetaReads.data, 4) ?? null)?.trim() || null,
      decimals: readNumber(readResult(tokenMetaReads.data, 5)) ?? 18,
    };
  }, [rawToken1, tokenMetaReads.data]);

  return useMemo<SlipstreamPoolState>(
    () => ({
      chainId,
      address: poolAddress ?? ("0x0000000000000000000000000000000000000000" as Address),
      token0,
      token1,
      currentTick: slot0.tick,
      sqrtPriceX96: slot0.sqrtPriceX96,
      tickSpacing,
    }),
    [chainId, poolAddress, slot0.sqrtPriceX96, slot0.tick, tickSpacing, token0, token1],
  );
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
  const pool = useSlipstreamPoolState(chainId, poolKey);
  const { ref: chartRef, size } = useElementSize<HTMLDivElement>();

  const [strategy, setStrategy] = useState<SlipstreamRangePreset>("balanced");
  const [selection, setSelection] = useState<SlipstreamTickRange | null>(null);
  const [viewportCenterTick, setViewportCenterTick] = useState<number | null>(null);
  const [viewportHalfIntervals, setViewportHalfIntervals] = useState<number | null>(null);
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
    return normalizeTickRange(selectedRange, pool.tickSpacing, bounds ?? getPoolTickBounds(pool.tickSpacing));
  }, [bounds, pool.tickSpacing, selectedRange]);

  const visibleRange = useMemo(() => {
    if (!pool.tickSpacing) return null;
    const centerTick = viewportCenterTick ?? getRangeMidpoint(normalizedSelectedRange ?? defaultSelection ?? {
      tickLower: 0,
      tickUpper: pool.tickSpacing,
    });
    if (centerTick === null || !Number.isFinite(centerTick)) return null;

    const halfIntervals = Math.max(MIN_VISIBLE_INTERVALS, viewportHalfIntervals ?? INITIAL_ZOOM_INTERVALS);
    const visible = normalizeTickRange(
      {
        tickLower: centerTick - halfIntervals * pool.tickSpacing,
        tickUpper: centerTick + halfIntervals * pool.tickSpacing,
      },
      pool.tickSpacing,
      bounds ?? getPoolTickBounds(pool.tickSpacing),
    );

    return visible;
  }, [bounds, defaultSelection, normalizedSelectedRange, pool.tickSpacing, viewportCenterTick, viewportHalfIntervals]);

  const sampleTicks = useMemo(() => {
    if (!visibleRange || !pool.tickSpacing) return [];

    const span = visibleRange.tickUpper - visibleRange.tickLower;
    const desiredBars = Math.max(
      2,
      Math.min(64, Math.trunc(span / pool.tickSpacing) + 1),
    );
    const step = Math.max(
      pool.tickSpacing,
      Math.trunc((span / Math.max(desiredBars - 1, 1)) / pool.tickSpacing) * pool.tickSpacing,
    );

    const ticks: number[] = [];
    for (let tick = visibleRange.tickLower; tick <= visibleRange.tickUpper; tick += step) {
      ticks.push(clampTickToBounds(tick, visibleRange.tickLower, visibleRange.tickUpper));
      if (ticks.length >= desiredBars) break;
    }

    if (ticks[ticks.length - 1] !== visibleRange.tickUpper) {
      ticks.push(visibleRange.tickUpper);
    }

    return [...new Set(ticks)].sort((a, b) => a - b);
  }, [pool.tickSpacing, visibleRange]);

  const tickReads = useReadContracts({
    allowFailure: true,
    contracts:
      pool.address && pool.tickSpacing && visibleRange
        ? sampleTicks.map((tick) => ({
            address: pool.address,
            abi: SLIPSTREAM_POOL_READ_ABI,
            functionName: "ticks",
            args: [BigInt(tick)],
          }))
        : [],
    query: {
      ...staticReadQueryOptions,
      enabled: Boolean(pool.address && pool.tickSpacing && visibleRange && sampleTicks.length > 0),
    },
  });

  const liveLiquidityByTick = useMemo(() => {
    const map = new Map<number, bigint | null>();

    sampleTicks.forEach((tick, index) => {
      const result = readResult(tickReads.data, index);
      if (Array.isArray(result)) {
        const liquidityGross = result[0];
        map.set(tick, typeof liquidityGross === "bigint" ? liquidityGross : null);
        return;
      }

      if (result && typeof result === "object") {
        const maybe = result as { liquidityGross?: unknown };
        map.set(tick, typeof maybe.liquidityGross === "bigint" ? maybe.liquidityGross : null);
        return;
      }

      map.set(tick, null);
    });

    return map;
  }, [sampleTicks, tickReads.data]);

  const liquiditySeries = useMemo<SlipstreamLiquiditySeries>(() => {
    if (!visibleRange || !pool.tickSpacing || pool.currentTick === null) {
      return buildFallbackLiquiditySeries({
        range: { tickLower: 0, tickUpper: 1 },
        tickSpacing: 1,
        currentTick: 0,
      });
    }

    return buildLiquiditySeries({
      range: visibleRange,
      tickSpacing: pool.tickSpacing,
      currentTick: pool.currentTick,
      liveLiquidityByTick,
    });
  }, [liveLiquidityByTick, pool.currentTick, pool.tickSpacing, visibleRange]);

  const innerWidth = Math.max(0, size.width - CHART_PADDING.left - CHART_PADDING.right);
  const innerHeight = Math.max(0, CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom);
  const xScale = useMemo(() => {
    if (!visibleRange) return null;

    return scaleLinear<number>({
      domain: [visibleRange.tickLower, visibleRange.tickUpper],
      range: [CHART_PADDING.left, CHART_PADDING.left + innerWidth],
      clamp: true,
    });
  }, [innerWidth, visibleRange]);

  const yScale = useMemo(() => {
    return scaleLinear<number>({
      domain: [0, Math.max(liquiditySeries.maxLiquidity, 1)],
      range: [CHART_PADDING.top + innerHeight, CHART_PADDING.top],
      clamp: true,
      nice: true,
    });
  }, [innerHeight, liquiditySeries.maxLiquidity]);

  const currentTick = pool.currentTick;
  const currentTickInRange =
    currentTick !== null && visibleRange
      ? currentTick >= visibleRange.tickLower && currentTick <= visibleRange.tickUpper
      : false;

  const currentX = currentTick !== null && xScale ? xScale(currentTick) : null;
  const renderedRange = normalizedSelectedRange ?? selectedRange;
  const selectedLowerX = renderedRange && xScale ? xScale(renderedRange.tickLower) : null;
  const selectedUpperX = renderedRange && xScale ? xScale(renderedRange.tickUpper) : null;
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

    const normalized = normalizeTickRange(nextRange, pool.tickSpacing, bounds ?? getPoolTickBounds(pool.tickSpacing));
    setSelection(normalized);
    setStrategy(nextStrategy);
    onSelectionChange?.({ range: normalized, strategy: nextStrategy });
    setViewportCenterTick(getRangeMidpoint(normalized));

    const neededHalfIntervals = Math.ceil(getRangeTickCount(normalized, pool.tickSpacing) / 2) + 2;
    setViewportHalfIntervals((current) =>
      Math.max(
        nextStrategy === "full-range" ? fullRangeHalfIntervals : current ?? INITIAL_ZOOM_INTERVALS,
        neededHalfIntervals,
      ),
    );
  }

  function updateHandle(handle: "lower" | "upper", tick: number) {
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

  function handleRangeKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    handle: "lower" | "upper",
  ) {
    if (!pool.tickSpacing || !selectedRange) return;

    const step = event.shiftKey ? pool.tickSpacing * 4 : pool.tickSpacing;
    let nextTick: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextTick = handle === "lower" ? selectedRange.tickLower - step : selectedRange.tickUpper - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextTick = handle === "lower" ? selectedRange.tickLower + step : selectedRange.tickUpper + step;
    } else if (event.key === "Home") {
      nextTick = bounds?.minUsable ?? null;
    } else if (event.key === "End") {
      nextTick = bounds?.maxUsable ?? null;
    }

    if (nextTick === null) return;

    event.preventDefault();
    updateHandle(handle, nextTick);
  }

  function onDragStart(handle: "lower" | "upper") {
    const tickSpacing = pool.tickSpacing;
    if (!chartRef.current || !tickSpacing || !selectedRange || !visibleRange) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = chartRef.current?.getBoundingClientRect();
      if (!rect) return;

      const innerLeft = rect.left + CHART_PADDING.left;
      const innerRight = rect.right - CHART_PADDING.right;
      const boundedX = Math.min(innerRight, Math.max(innerLeft, event.clientX));
      const ratio = (boundedX - innerLeft) / Math.max(innerRight - innerLeft, 1);
      const rawTick = visibleRange.tickLower + ratio * (visibleRange.tickUpper - visibleRange.tickLower);
      const snapped = Math.round(rawTick / tickSpacing) * tickSpacing;

      updateHandle(handle, snapped);
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

  useEffect(() => {
    if (controlledSelectedRange !== null && controlledSelectedRange !== undefined) return;
    if (selection !== null || !defaultSelection) return;

    onSelectionChange?.({
      range: defaultSelection,
      strategy: controlledSelectedStrategy ?? "balanced",
    });
  }, [controlledSelectedRange, controlledSelectedStrategy, defaultSelection, onSelectionChange, selection]);

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">Price range</p>
            <Badge className="border-white/10 bg-white/[0.04] text-white/70">{presetLabel}</Badge>
            {liquiditySeries.hasLiveData ? (
              <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-100">Live liquidity</Badge>
            ) : (
              <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100">Fallback liquidity</Badge>
            )}
          </div>
          <p className="text-xs text-white/45">
            {pool.token0?.symbol ?? shortenAddress(pool.token0?.address)} /{" "}
            {pool.token1?.symbol ?? shortenAddress(pool.token1?.address)}
          </p>
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

      <div ref={chartRef} className="relative h-[252px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#090d13]">
        {size.width > 0 && xScale !== null && yScale !== null && visibleRange !== null ? (
          <>
            <svg width={size.width} height={CHART_HEIGHT} role="img" aria-label="Concentrated liquidity distribution">
              <defs>
                <linearGradient id="liquidity-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(196,160,106,0.92)" />
                  <stop offset="100%" stopColor="rgba(196,160,106,0.06)" />
                </linearGradient>
                <linearGradient id="liquidity-selected" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(84,140,255,0.68)" />
                  <stop offset="100%" stopColor="rgba(84,140,255,0.12)" />
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

                {liquiditySeries.points.map((point, index) => {
                  const nextTick = liquiditySeries.points[index + 1]?.tick ?? visibleRange.tickUpper;
                  const x = xScale(point.tick);
                  const nextX = xScale(nextTick);
                  const width = Math.max(1, nextX - x);
                  const barY = yScale(point.liquidityGross);
                  const selectionLowerTick = activeSelectedRange?.tickLower ?? visibleRange.tickLower;
                  const selectionUpperTick = activeSelectedRange?.tickUpper ?? visibleRange.tickUpper;
                  const isInsideSelection =
                    point.tick >= selectionLowerTick && point.tick <= selectionUpperTick;

                  return (
                    <rect
                      key={`${point.tick}-${index}`}
                      x={x}
                      y={barY}
                      width={width}
                      height={Math.max(0, CHART_PADDING.top + innerHeight - barY)}
                      rx={2}
                      fill={isInsideSelection ? "url(#liquidity-selected)" : "url(#liquidity-fill)"}
                      opacity={point.liquidityGross > 0 ? (point.isLive ? 1 : 0.72) : 0.16}
                    />
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

            {selectedLowerX !== null && activeSelectedRange ? (
              <button
                type="button"
                role="slider"
                aria-label="Drag lower range handle"
                aria-orientation="horizontal"
                aria-valuemin={bounds?.minUsable ?? activeSelectedRange.tickLower}
                aria-valuemax={(activeSelectedRange.tickUpper - (pool.tickSpacing ?? 1))}
                aria-valuenow={activeSelectedRange.tickLower}
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
                aria-valuemin={(activeSelectedRange.tickLower + (pool.tickSpacing ?? 1))}
                aria-valuemax={bounds?.maxUsable ?? activeSelectedRange.tickUpper}
                aria-valuenow={activeSelectedRange.tickUpper}
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
              <span>{visibleRange.tickLower}</span>
              <span className="text-white/55">
                {currentPriceText ?? "Current price unavailable"}
              </span>
              <span>{visibleRange.tickUpper}</span>
            </div>
          </>
        ) : null}

        {size.width === 0 || !xScale || !yScale || !visibleRange ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/45">
            Loading liquidity distribution...
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
            Handles snap to pool tick spacing. Presets keep canonical tick bounds, while the zoom
            buttons only change the visible chart window.
          </p>
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
