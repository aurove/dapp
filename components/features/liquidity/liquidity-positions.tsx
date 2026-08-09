"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ChevronDown, ChevronUp, Coins, Droplets, Lock, Plus, RefreshCw, Trash2, Unlock } from "lucide-react";
import { encodeFunctionData, formatUnits, type Abi, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardTitle, Input, Skeleton, cn } from "@ui";
import {
  getLiquidityId20GaugeDescriptors,
  makeId20ActivationGuardSteps,
  useId20GaugePositions,
} from "@/components/features/id20/use-id20-gauges";
import { getContractConfig } from "@/contracts/shared";
import { getPortfolioRegistry, usePortfolioSummary, type LiquidityPortfolio, type PortfolioDomain, type PortfolioRegistry, type PortfolioSummary, type WalletPortfolio } from "@/features/portfolio";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeTokenApprovalStep, type TxStep } from "@/lib/tx-flow";
import { useChainDeadline } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount, parseAmountRaw } from "@/lib/web3/value-parsers";
import {
  formatPriceLabel,
  getDisplayPriceRangeTicks,
  getDisplayTokenOrientation,
  type SlipstreamPoolState,
} from "./slipstream-adapter";
import {
  buildSlipstreamLiquidityQuote,
  type SlipstreamLiquiditySide,
} from "./slipstream-liquidity-quote";
import { LiquidityTokenInput } from "./liquidity-token-input";
import {
  buildLiquidityApprovalStep,
  buildLiquidityRouterCall,
  buildLiquiditySourceOptions,
  resolveSelectedLiquiditySource,
} from "./liquidity-source-routing";

const UINT128_MAX = (1n << 128n) - 1n;
const DEFAULT_SLIPPAGE_BPS = 50;

type Position = LiquidityPortfolio["positions"][string];
type TokenMeta = { symbol: string; decimals: number; address: Address; rawBalance: bigint };
type ClGauge = PortfolioRegistry["clGauges"][number];
type ManageTab = "adjust" | "stake" | "unstake";

function withDomains(step: TxStep, domains: readonly PortfolioDomain[]) {
  if (step.type === "write") step.portfolioDomains = domains;
  return step;
}

function amount(raw: bigint | undefined, token: TokenMeta | undefined) {
  if (raw === undefined || !token) return "Unavailable";
  return formatCompactRawTokenAmount(raw, token.decimals, token.symbol);
}

function formatPercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)}%`;
}

function tokenFamily(token: TokenMeta | undefined) {
  const symbol = token?.symbol.toUpperCase() ?? "";
  if (symbol.includes("BTC")) return "BTC";
  if (symbol.includes("MEZO")) return "MEZO";
  if (symbol.includes("AUROVE") || token?.symbol.toLowerCase().startsWith("av")) return "Aurove";
  return "MUSD";
}

function TokenMark({ token, className }: { token?: TokenMeta; className?: string }) {
  const family = tokenFamily(token);
  return (
    <span
      className={cn(
        "grid shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#18222b]",
        className,
      )}
    >
      <Image
        src={`/tokens/${family}.png`}
        alt={`${token?.symbol ?? family} token`}
        width={32}
        height={32}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function TokenPair({ token0, token1 }: { token0?: TokenMeta; token1?: TokenMeta }) {
  const marks = [
    { family: tokenFamily(token0), symbol: token0?.symbol ?? tokenFamily(token0) },
    { family: tokenFamily(token1), symbol: token1?.symbol ?? tokenFamily(token1) },
  ];
  return (
    <div className="relative h-11 w-16 shrink-0">
      {marks.map((mark, index) => (
        <span
          key={`${mark.family}-${index}`}
          className={cn(
            "absolute grid overflow-hidden rounded-full border-2 border-[#10161c] bg-[#18222b]",
            index === 0 ? "left-0 top-0 h-11 w-11" : "bottom-0 right-0 h-7 w-7",
          )}
        >
          <Image
            src={`/tokens/${mark.family}.png`}
            alt={`${mark.symbol} token`}
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </span>
      ))}
    </div>
  );
}

function statusOf(position: Position) {
  if (position.liquidity === 0n) return { label: "Closed", help: "Closed — no active liquidity", tone: "border-white/15 bg-white/5 text-white/60" };
  if (position.isStaked) {
    if (position.currentTick === undefined) {
      return { label: "Staked", help: "Staked in gauge — earning emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" };
    }
    const active = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
    return active
      ? { label: "Staked · In range", help: "Staked and in range — earning swap fees and gauge emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" }
      : { label: "Staked · Out of range", help: "Staked but out of range — still earning gauge emissions", tone: "border-sky-300/25 bg-sky-300/10 text-sky-100" };
  }
  if (position.currentTick === undefined) return { label: "Unavailable", help: "Pool status is temporarily unavailable", tone: "border-white/15 bg-white/5 text-white/60" };
  const active = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
  return active
    ? { label: "In range", help: "In range — earning swap fees", tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" }
    : { label: "Out of range", help: "Out of range — not currently earning swap fees", tone: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
}

function resolveGaugeForPosition(position: Position, gauges: readonly ClGauge[]): ClGauge | null {
  if (position.gaugeAddress) {
    return gauges.find((gauge) => gauge.address.toLowerCase() === position.gaugeAddress!.toLowerCase()) ?? null;
  }
  return gauges.find((gauge) => gauge.poolKey === position.poolKey) ?? null;
}

function ManageTabBar({
  active,
  onChange,
  isStaked,
  hasGauge,
}: {
  active: ManageTab;
  onChange: (tab: ManageTab) => void;
  isStaked: boolean;
  hasGauge: boolean;
}) {
  const tabs: { id: ManageTab; label: string; disabled?: boolean; title?: string }[] = [
    { id: "adjust", label: "Adjust" },
    {
      id: "stake",
      label: "Stake",
      disabled: !hasGauge || isStaked,
      title: !hasGauge
        ? "No gauge is configured for this pool"
        : isStaked
          ? "Already staked in the gauge"
          : "Deposit this position NFT into the pool gauge",
    },
    {
      id: "unstake",
      label: "Unstake",
      disabled: !isStaked,
      title: isStaked ? "Withdraw this position NFT from the gauge" : "Stake this position before unstaking",
    },
  ];
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.025] p-1"
      role="tablist"
      aria-label="Liquidity management actions"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          disabled={tab.disabled}
          title={tab.title}
          onClick={() => onChange(tab.id)}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-medium transition",
            active === tab.id
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/55 hover:text-white/80",
            tab.disabled && "cursor-not-allowed opacity-40 hover:text-white/55",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ActionMessage({ success, error }: { success: string | null; error: string | null }) {
  if (!success && !error) return null;
  return <p role="status" className={cn("rounded-lg border px-3 py-2 text-xs", error ? "border-red-300/20 bg-red-300/10 text-red-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100")}>{error ?? success}</p>;
}

function AggregateFeeCollection({
  positions,
  tokens,
  managerAddress,
  managerAbi,
}: {
  positions: Position[];
  tokens: Map<string, TokenMeta>;
  managerAddress: Address;
  managerAbi: Abi;
}) {
  const { address } = useAccount();
  const collectablePositions = useMemo(
    () => positions.filter((position) => !position.isStaked && (position.tokensOwed0 > 0n || position.tokensOwed1 > 0n)),
    [positions],
  );
  const feeTotals = useMemo(() => {
    const totals = new Map<string, { raw: bigint; token?: TokenMeta }>();
    const add = (tokenAddress: Address, raw: bigint) => {
      if (raw === 0n) return;
      const key = tokenAddress.toLowerCase();
      const current = totals.get(key);
      totals.set(key, {
        raw: (current?.raw ?? 0n) + raw,
        token: current?.token ?? tokens.get(key),
      });
    };
    collectablePositions.forEach((position) => {
      add(position.token0, position.tokensOwed0);
      add(position.token1, position.tokensOwed1);
    });
    return [...totals.entries()];
  }, [collectablePositions, tokens]);
  const collectCalls = useMemo(() => {
    if (!address) return [];
    return collectablePositions.map((position) => encodeFunctionData({
      abi: managerAbi,
      functionName: "collect",
      args: [{
        tokenId: position.tokenId,
        recipient: address,
        amount0Max: UINT128_MAX,
        amount1Max: UINT128_MAX,
      }],
    }));
  }, [address, collectablePositions, managerAbi]);
  const collectSteps = address && collectCalls.length > 0
    ? [withDomains(makeAddressWriteStep({
      key: "liquidity-collect-all-fees",
      label: "Collect all fees",
      displayLabelBtn: true,
      address: managerAddress,
      abi: managerAbi,
      variables: { functionName: "multicall", args: [collectCalls] },
    }) as TxStep, ["liquidity", "wallet", "id20"])]
    : [];

  return <Card className="border-white/10 bg-gradient-to-r from-emerald-300/[0.045] via-white/[0.025] to-transparent">
    <CardContent className="grid gap-4 py-5 lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.5fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-100"><Coins className="h-4 w-4" /></span>
        <div>
          <h3 className="font-medium text-white">Available fees</h3>
          <p className="text-xs text-white/50">
            {collectablePositions.length > 0
              ? `Across ${collectablePositions.length} position${collectablePositions.length === 1 ? "" : "s"}`
              : "No fees available to collect"}
          </p>
        </div>
      </div>
      <div className="flex min-h-16 min-w-0 flex-wrap items-center rounded-xl border border-white/[0.06] bg-white/[0.035] px-1">
        {feeTotals.length > 0 ? feeTotals.map(([tokenAddress, total], index) => <div key={tokenAddress} className={cn("flex min-w-36 flex-1 items-center gap-2 px-4 py-2", index > 0 && "border-l border-white/10")}>
          <TokenMark token={total.token} className="h-7 w-7" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{total.token ? formatCompactRawTokenAmount(total.raw, total.token.decimals, null) : total.raw.toString()}</p>
            <p className="truncate text-xs text-white/55">{total.token?.symbol ?? `${tokenAddress.slice(0, 6)}…${tokenAddress.slice(-4)}`}</p>
          </div>
        </div>) : <p className="px-4 py-3 text-sm text-white/45">Your collected fee totals will appear here.</p>}
      </div>
      <div className="shrink-0 space-y-2 lg:min-w-44">
        <TransactionFlowButton
          className="w-full"
          steps={collectSteps}
          disabled={!address || collectablePositions.length === 0}
          icon={<Coins className="h-4 w-4" />}
        >
          Collect all
        </TransactionFlowButton>
      </div>
    </CardContent>
  </Card>;
}

function PositionActions({
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
  clGauges,
  rewardTokenMeta,
}: {
  position: Position;
  token0?: TokenMeta;
  token1?: TokenMeta;
  displayInverted: boolean;
  managerAddress: Address;
  managerAbi: Abi;
  routerAddress: Address;
  routerAbi: Abi;
  ledgerAddress: Address;
  deadline: bigint | null;
  portfolio?: PortfolioSummary;
  veCollections: WalletPortfolio["veCollections"];
  clGauges: readonly ClGauge[];
  rewardTokenMeta?: TokenMeta;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const id20Gauges = useId20GaugePositions(chainId, address);
  const gauge = resolveGaugeForPosition(position, clGauges);
  const [tab, setTab] = useState<ManageTab>(position.isStaked ? "unstake" : "adjust");
  const removeTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const increaseTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const burnTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const stakeTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const unstakeTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const claimTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const [percent, setPercent] = useState("25");
  const [slippage, setSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const [increaseSlippage, setIncreaseSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const [increaseActiveSide, setIncreaseActiveSide] = useState<SlipstreamLiquiditySide>("assetA");
  const [increaseDrafts, setIncreaseDrafts] = useState<Record<SlipstreamLiquiditySide, string>>({ assetA: "", assetB: "" });
  const [increaseSourceIds, setIncreaseSourceIds] = useState<Record<SlipstreamLiquiditySide, string | null>>({ assetA: null, assetB: null });
  const [collectAfter, setCollectAfter] = useState(true);
  const [claimOnUnstake, setClaimOnUnstake] = useState(true);
  const [burnConfirmed, setBurnConfirmed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const numericPercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const removeLiquidity = (position.liquidity * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated0 = position.rawAmount0 === undefined ? undefined : (position.rawAmount0 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated1 = position.rawAmount1 === undefined ? undefined : (position.rawAmount1 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const slippageBps = BigInt(Math.min(5_000, Math.max(0, Math.round((Number(slippage) || 0) * 100))));
  const min0 = estimated0 === undefined ? 0n : estimated0 * (10_000n - slippageBps) / 10_000n;
  const min1 = estimated1 === undefined ? 0n : estimated1 * (10_000n - slippageBps) / 10_000n;
  const canBurn = !position.isStaked && position.liquidity === 0n && position.tokensOwed0 === 0n && position.tokensOwed1 === 0n;
  const estimatedAmounts = displayInverted
    ? [[estimated1, token1], [estimated0, token0]] as const
    : [[estimated0, token0], [estimated1, token1]] as const;
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
      (item) => required.has(item.id20Address.toLowerCase()) && !item.isActive,
    );
  }, [id20Gauges.gauges, requiredId20Gauges]);
  const increaseSteps: TxStep[] = requiredId20Gauges.flatMap(makeId20ActivationGuardSteps);
  if (!position.isStaked && increaseQuote.status === "ok" && increaseQuote.routerPlan && increaseRouterCall && routerSupportsIncrease && increaseSourceA && increaseSourceB) {
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
    if (approvalA) increaseSteps.push(approvalA);
    if (approvalB) increaseSteps.push(approvalB);
    increaseSteps.push(withDomains(makeAddressWriteStep({
      key: "liquidity-increase",
      label: "Increase liquidity",
      displayLabelBtn: true,
      address: routerAddress,
      abi: routerAbi,
      variables: increaseRouterCall,
    }) as TxStep, ["liquidity", "wallet", "tranches", "id20", "rewards"]));
  }

  const collectSteps = address && !position.isStaked ? [withDomains(makeAddressWriteStep({ key: "liquidity-collect-fees", label: "Collect fees", displayLabelBtn: true, address: managerAddress, abi: managerAbi, variables: { functionName: "collect", args: [{ tokenId: position.tokenId, recipient: address, amount0Max: UINT128_MAX, amount1Max: UINT128_MAX }] } }) as TxStep, ["liquidity", "wallet", "id20"])] : [];
  const removeSteps = address && deadline !== null && !position.isStaked && removeLiquidity > 0n ? [withDomains(makeAddressWriteStep({ key: "liquidity-remove", label: numericPercent === 100 ? "Remove all liquidity" : "Remove liquidity", displayLabelBtn: true, address: managerAddress, abi: managerAbi, variables: { functionName: "decreaseLiquidity", args: [{ tokenId: position.tokenId, liquidity: removeLiquidity, amount0Min: min0, amount1Min: min1, deadline }] } }) as TxStep, ["liquidity", "wallet", "id20"]), ...(collectAfter ? collectSteps : [])] : [];

  const stakeSteps: TxStep[] = [];
  if (address && gauge && !position.isStaked && position.liquidity > 0n) {
    stakeSteps.push(withDomains(makeTokenApprovalStep({
      key: `liquidity-stake-approve-${position.tokenId}`,
      label: "Approve position NFT for gauge",
      displayLabelBtn: true,
      approval: {
        standard: "erc721",
        token: managerAddress,
        operator: gauge.address,
        scope: { kind: "token", tokenId: position.tokenId },
      },
    }) as TxStep, ["liquidity"]));
    stakeSteps.push(withDomains(makeAddressWriteStep({
      key: `liquidity-stake-${position.tokenId}`,
      label: "Stake position in gauge",
      displayLabelBtn: true,
      address: gauge.address,
      abi: gauge.abi as Abi,
      variables: { functionName: "deposit", args: [position.tokenId] },
    }) as TxStep, ["liquidity", "rewards"]));
  }

  const unstakeSteps: TxStep[] = [];
  if (address && gauge && position.isStaked) {
    if (claimOnUnstake) {
      unstakeSteps.push(withDomains(makeAddressWriteStep({
        key: `liquidity-claim-before-unstake-${position.tokenId}`,
        label: "Claim gauge rewards",
        displayLabelBtn: true,
        address: gauge.address,
        abi: gauge.abi as Abi,
        variables: { functionName: "getReward", args: [position.tokenId] },
      }) as TxStep, ["liquidity", "rewards", "wallet"]));
    }
    unstakeSteps.push(withDomains(makeAddressWriteStep({
      key: `liquidity-unstake-${position.tokenId}`,
      label: "Unstake position from gauge",
      displayLabelBtn: true,
      address: gauge.address,
      abi: gauge.abi as Abi,
      variables: { functionName: "withdraw", args: [position.tokenId] },
    }) as TxStep, ["liquidity", "rewards"]));
  }

  const claimOnlySteps: TxStep[] = address && gauge && position.isStaked
    ? [withDomains(makeAddressWriteStep({
      key: `liquidity-claim-rewards-${position.tokenId}`,
      label: "Claim gauge rewards",
      displayLabelBtn: true,
      address: gauge.address,
      abi: gauge.abi as Abi,
      variables: { functionName: "getReward", args: [position.tokenId] },
    }) as TxStep, ["liquidity", "rewards", "wallet"])]
    : [];

  const complete = (message: string) => () => {
    setError(null);
    setSuccess(message);
    void id20Gauges.refresh();
  };
  const failed = (message: string) => { setSuccess(null); setError(message); };
  const removeFormik = useFormik({
    initialValues: { percent, slippage, collectAfter },
    enableReinitialize: true,
    validationSchema: Yup.object({
      percent: Yup.number().typeError("Enter a valid percentage.").moreThan(0).max(100).required(),
      slippage: Yup.number().typeError("Enter a valid slippage.").min(0).max(50).required(),
      collectAfter: Yup.boolean().required(),
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

  const activeTab = tab === "stake" && (position.isStaked || !gauge)
    ? "adjust"
    : tab === "unstake" && !position.isStaked
      ? "adjust"
      : tab;

  const earnedLabel = position.gaugeEarnedRaw !== undefined
    ? amount(position.gaugeEarnedRaw, rewardTokenMeta ?? (position.rewardToken
      ? { symbol: "MEZO", decimals: 18, address: position.rewardToken, rawBalance: 0n }
      : undefined))
    : "Unavailable";

  return (
    <div className="space-y-4 pt-2">
      <ManageTabBar
        active={activeTab}
        onChange={setTab}
        isStaked={position.isStaked}
        hasGauge={Boolean(gauge)}
      />

      {activeTab === "adjust" ? (
        position.isStaked ? (
          <div className="rounded-2xl border border-sky-300/20 bg-sky-300/10 p-5">
            <h4 className="font-medium text-sky-50">Unstake to adjust</h4>
            <p className="mt-1 text-sm text-sky-100/80">
              This position NFT is deposited in the pool gauge. Unstake it before increasing, removing, or burning liquidity.
            </p>
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => setTab("unstake")}>
              Go to Unstake
            </Button>
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <form onSubmit={removeFormik.handleSubmit} noValidate className="space-y-2.5 rounded-2xl border border-white/15 bg-black/10 p-4">
              <div><h4 className="font-medium text-white">Remove liquidity</h4><p className="text-xs text-white/50">Partially or fully withdraw the active position.</p></div>
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_6.5rem] xl:items-end">
                <label className="block text-xs text-white/60">
                  <span className="flex items-center justify-between gap-3"><span>Percentage</span><span className="font-medium text-white">{numericPercent}%</span></span>
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
                <label className="block text-xs text-white/60">Slippage (%)<Input name="slippage" value={slippage} onBlur={removeFormik.handleBlur} onChange={(event) => { setSlippage(event.target.value); void removeFormik.setFieldValue("slippage", event.target.value); }} inputMode="decimal" className="mt-1 h-9" /></label>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">{estimatedAmounts.map(([raw, token], index) => <span key={index} className="truncate rounded-lg bg-white/5 px-2.5 py-2">Est. {amount(raw, token)}</span>)}</div>
              <label className="flex items-center gap-2 border-t border-white/[0.07] pt-2.5 text-xs text-white/65"><input name="collectAfter" type="checkbox" checked={collectAfter} onChange={(event) => { setCollectAfter(event.target.checked); void removeFormik.setFieldValue("collectAfter", event.target.checked); }} /> Collect owed tokens after removal</label>
              {removeFormik.submitCount > 0 && (removeFormik.errors.percent || removeFormik.errors.slippage) ? <p role="alert" className="text-xs text-red-200">{removeFormik.errors.percent ?? removeFormik.errors.slippage}</p> : null}
              <TransactionFlowButton ref={removeTransactionRef} type="submit" className="w-full" steps={removeSteps} disabled={deadline === null || removeLiquidity <= 0n} onComplete={complete(numericPercent === 100 ? "Liquidity fully removed. The NFT was not burned." : "Liquidity partially removed.")} onError={failed}>Preview and remove</TransactionFlowButton>
            </form>
            <div className="space-y-3 rounded-2xl border border-white/15 bg-black/10 p-5">
              <form onSubmit={increaseFormik.handleSubmit} noValidate className="space-y-3">
                <div><h4 className="font-medium text-white">Increase liquidity</h4><p className="text-xs text-white/50">Add more liquidity to this position within its exact range.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {increaseDisplaySides.map((side) => {
                    const token = side === "assetA" ? token0 : token1;
                    const sources = side === "assetA" ? increaseSources.assetA : increaseSources.assetB;
                    const source = side === "assetA" ? increaseSourceA : increaseSourceB;
                    return <LiquidityTokenInput
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
                    />;
                  })}
                </div>
                {inactiveRequiredId20s.length > 0 ? <p role="status" className="rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">Activate {inactiveRequiredId20s.map((item) => item.symbol).join(" and ")} rewards first. The activation step is included and these increase-liquidity inputs will be preserved.</p> : null}
                {increaseRouterCall && !routerSupportsIncrease ? <p role="status" className="text-xs text-amber-100">The configured zap router does not yet expose position-aware increase methods. Deploy and sync the updated router before using this action.</p> : null}
                {increaseFormik.submitCount > 0 && (increaseFormik.errors.amount || increaseFormik.errors.slippage) ? <p role="alert" className="text-xs text-red-200">{increaseFormik.errors.amount ?? increaseFormik.errors.slippage}</p> : null}
                <div className="grid gap-2 lg:grid-cols-[minmax(7.5rem,1fr)_5fr] lg:items-end">
                  <label className="block text-xs text-white/60">Slippage (%)<Input name="slippage" value={increaseSlippage} onBlur={increaseFormik.handleBlur} onChange={(event) => { setIncreaseSlippage(event.target.value); void increaseFormik.setFieldValue("slippage", event.target.value); }} inputMode="decimal" className="mt-1 h-10" /></label>
                  <TransactionFlowButton ref={increaseTransactionRef} type="submit" className="h-10 w-full" variant="secondary" steps={increaseSteps} disabled={increaseQuote.status !== "ok" || !routerSupportsIncrease} icon={<Plus className="h-4 w-4" />} onComplete={complete("Liquidity increased.")} onError={failed}>Preview and increase</TransactionFlowButton>
                </div>
              </form>
              {canBurn ? <form onSubmit={burnFormik.handleSubmit} noValidate className="border-t border-white/10 pt-3"><label className="flex items-start gap-2 text-xs text-white/65"><input name="burnConfirmed" type="checkbox" checked={burnConfirmed} onChange={(event) => { setBurnConfirmed(event.target.checked); void burnFormik.setFieldValue("burnConfirmed", event.target.checked); }} /> I confirm this empty NFT should be permanently burned.</label>{burnFormik.submitCount > 0 && burnFormik.errors.burnConfirmed ? <p role="alert" className="mt-2 text-xs text-red-200">{burnFormik.errors.burnConfirmed}</p> : null}<TransactionFlowButton ref={burnTransactionRef} type="submit" className="mt-2 w-full" variant="secondary" disabled={!burnConfirmed} steps={[withDomains(makeAddressWriteStep({ key: "liquidity-burn-position", label: "Burn empty position NFT", address: managerAddress, abi: managerAbi, variables: { functionName: "burn", args: [position.tokenId] } }) as TxStep, ["liquidity"])]} onComplete={complete("Empty position NFT burned.")} onError={failed}><Trash2 className="h-4 w-4" /> Burn empty NFT</TransactionFlowButton></form> : null}
            </div>
          </div>
        )
      ) : null}

      {activeTab === "stake" ? (
        <div className="space-y-4 rounded-2xl border border-white/15 bg-black/10 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-300/10 text-sky-100"><Lock className="h-4 w-4" /></span>
            <div>
              <h4 className="font-medium text-white">Stake liquidity</h4>
              <p className="mt-1 text-sm text-white/55">
                Deposit position NFT #{position.tokenId.toString()} into the {position.poolKey} gauge to earn emissions. Swap fees continue while the range is active; unstake before adjusting liquidity.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/45">Position</p>
              <p className="mt-1 text-sm font-medium text-white">NFT #{position.tokenId.toString()}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/45">Gauge</p>
              <p className="mt-1 truncate text-sm font-medium text-white">{gauge?.key ?? "Unavailable"}</p>
            </div>
          </div>
          {!gauge ? (
            <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">No CL gauge is configured for this pool on the current network.</p>
          ) : position.liquidity <= 0n ? (
            <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Add liquidity before staking this empty position.</p>
          ) : (
            <TransactionFlowButton
              ref={stakeTransactionRef}
              className="w-full"
              steps={stakeSteps}
              disabled={!address || stakeSteps.length === 0}
              icon={<Lock className="h-4 w-4" />}
              onComplete={complete("Position staked in the gauge.")}
              onError={failed}
            >
              Preview and stake
            </TransactionFlowButton>
          )}
        </div>
      ) : null}

      {activeTab === "unstake" ? (
        <div className="space-y-4 rounded-2xl border border-white/15 bg-black/10 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-100"><Unlock className="h-4 w-4" /></span>
            <div>
              <h4 className="font-medium text-white">Unstake liquidity</h4>
              <p className="mt-1 text-sm text-white/55">
                Withdraw NFT #{position.tokenId.toString()} from the gauge so you can adjust or remove liquidity. Optionally claim accrued emissions in the same flow.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/45">Claimable emissions</p>
              <p className="mt-1 text-sm font-medium text-white">{earnedLabel}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
              <p className="text-xs text-white/45">Gauge</p>
              <p className="mt-1 truncate text-sm font-medium text-white">{gauge?.key ?? "Unavailable"}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/65">
            <input type="checkbox" checked={claimOnUnstake} onChange={(event) => setClaimOnUnstake(event.target.checked)} />
            Claim gauge rewards when unstaking
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <TransactionFlowButton
              ref={claimTransactionRef}
              className="w-full"
              variant="secondary"
              steps={claimOnlySteps}
              disabled={!address || claimOnlySteps.length === 0 || (position.gaugeEarnedRaw ?? 0n) <= 0n}
              icon={<Coins className="h-4 w-4" />}
              onComplete={complete("Gauge rewards claimed.")}
              onError={failed}
            >
              Claim rewards
            </TransactionFlowButton>
            <TransactionFlowButton
              ref={unstakeTransactionRef}
              className="w-full"
              steps={unstakeSteps}
              disabled={!address || unstakeSteps.length === 0}
              icon={<Unlock className="h-4 w-4" />}
              onComplete={complete(claimOnUnstake ? "Position unstaked and rewards claimed." : "Position unstaked from the gauge.")}
              onError={failed}
            >
              Preview and unstake
            </TransactionFlowButton>
          </div>
        </div>
      ) : null}

      <ActionMessage success={success} error={error} />
    </div>
  );
}

function PositionRange({
  position,
  poolState,
  lowTick,
  highTick,
  displayInverted,
}: {
  position: Position;
  poolState: SlipstreamPoolState;
  lowTick: number;
  highTick: number;
  displayInverted: boolean;
}) {
  const span = Math.max(1, position.tickUpper - position.tickLower);
  const positionRatio = position.currentTick === undefined
    ? 0.5
    : displayInverted
      ? (position.tickUpper - position.currentTick) / span
      : (position.currentTick - position.tickLower) / span;
  const currentPercent = Math.min(96, Math.max(4, 24 + positionRatio * 52));
  const inRange = position.currentTick !== undefined
    && position.currentTick >= position.tickLower
    && position.currentTick < position.tickUpper;
  const status = statusOf(position);
  const values = [
    { label: "Min price", value: formatPriceLabel({ pool: poolState, tick: lowTick }), tone: "text-white" },
    { label: "Current price", value: position.currentTick === undefined ? "Unavailable" : formatPriceLabel({ pool: poolState, tick: position.currentTick }), tone: inRange ? "text-emerald-300" : "text-amber-200" },
    { label: "Max price", value: formatPriceLabel({ pool: poolState, tick: highTick }), tone: "text-white" },
  ];

  return <div className="rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-4 sm:px-5">
    <div className="grid gap-4 lg:grid-cols-[160px_1fr] lg:items-start">
      <div className="lg:pt-1">
        <p className="text-sm text-white/65">{status.help}</p>
      </div>
      <div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {values.map((item) => <div key={item.label}>
            <p className={cn("truncate text-xs font-medium sm:text-sm", item.tone)}>{item.value}</p>
            <p className="mt-0.5 text-[11px] text-white/45">{item.label}</p>
          </div>)}
        </div>
        <div className="relative mt-5 h-7" aria-label="Position price range">
          <div className="absolute left-0 right-0 top-3 h-1.5 rounded-full bg-white/[0.07]" />
          <div className="absolute left-[24%] top-3 h-1.5 w-[52%] rounded-full bg-gradient-to-r from-emerald-300/65 via-emerald-200 to-emerald-300/65" />
          <span className="absolute left-[24%] top-1.5 h-4 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.35)]" />
          <span className="absolute left-[76%] top-1.5 h-4 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.35)]" />
          <span
            className={cn("absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent", inRange ? "border-b-emerald-300" : "border-b-amber-200")}
            style={{ left: `${currentPercent}%` }}
          />
        </div>
      </div>
    </div>
  </div>;
}

function LiquidityPositionCard({ position, tokens, managerAddress, managerAbi, routerAddress, routerAbi, ledgerAddress, deadline, portfolio, veCollections, clGauges, defaultOpen = false }: { position: Position; tokens: Map<string, TokenMeta>; managerAddress: Address; managerAbi: Abi; routerAddress: Address; routerAbi: Abi; ledgerAddress: Address; deadline: bigint | null; portfolio?: PortfolioSummary; veCollections: WalletPortfolio["veCollections"]; clGauges: readonly ClGauge[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const token0 = tokens.get(position.token0.toLowerCase()); const token1 = tokens.get(position.token1.toLowerCase());
  const rewardTokenMeta = position.rewardToken ? tokens.get(position.rewardToken.toLowerCase()) : undefined;
  const status = statusOf(position);
  const poolState: SlipstreamPoolState = { chainId: 0, address: position.pool, token0: token0 ? { ...token0, name: token0.symbol } : null, token1: token1 ? { ...token1, name: token1.symbol } : null, currentTick: position.currentTick ?? null, sqrtPriceX96: position.sqrtPriceX96 ?? null, tickSpacing: position.tickSpacing };
  const displayTokenOrientation = getDisplayTokenOrientation(poolState);
  const displayToken0 = displayTokenOrientation.inverted ? token1 : token0;
  const displayToken1 = displayTokenOrientation.inverted ? token0 : token1;
  const depositedAmounts = displayTokenOrientation.inverted
    ? [[position.rawAmount1, token1], [position.rawAmount0, token0]] as const
    : [[position.rawAmount0, token0], [position.rawAmount1, token1]] as const;
  const feeAmounts = displayTokenOrientation.inverted
    ? [[position.tokensOwed1, token1], [position.tokensOwed0, token0]] as const
    : [[position.tokensOwed0, token0], [position.tokensOwed1, token1]] as const;
  const { lowTick, highTick } = getDisplayPriceRangeTicks(poolState, position);
  const share = position.poolLiquidity && position.poolLiquidity > 0n ? Number(position.liquidity * 1_000_000n / position.poolLiquidity) / 10_000 : null;
  return <Card className="overflow-hidden border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.025] to-transparent">
    <button type="button" className="w-full px-5 py-5 text-left sm:px-6" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="relative flex items-start gap-4 pr-8">
          <TokenPair token0={displayToken0} token1={displayToken1} />
          <div>
            <CardTitle className="text-xl">{displayToken0?.symbol ?? "Token 0"} / {displayToken1?.symbol ?? "Token 1"}</CardTitle>
            <CardDescription className="mt-1">{position.poolKey} · Tick spacing {position.tickSpacing} · NFT #{position.tokenId.toString()}</CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={cn(status.tone)}>{status.label}</Badge>
              {position.isStaked ? <Badge className="border-sky-300/25 bg-sky-300/10 text-sky-100">Gauge</Badge> : null}
            </div>
          </div>
          <span className="absolute right-0 top-1 text-white/65">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3"><p className="text-xs text-white/45">Deposited</p>{depositedAmounts.map(([raw, token], index) => <p key={index} className={cn("truncate text-sm font-medium text-white", index === 0 && "mt-1")}>{amount(raw, token)}</p>)}</div>
          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3">
            <p className="text-xs text-white/45">{position.isStaked ? "Gauge emissions" : "Available fees"}</p>
            {position.isStaked ? (
              <p className="mt-1 truncate text-sm font-medium text-white">
                {amount(
                  position.gaugeEarnedRaw,
                  rewardTokenMeta ?? (position.rewardToken
                    ? { symbol: "MEZO", decimals: 18, address: position.rewardToken, rawBalance: 0n }
                    : undefined),
                )}
              </p>
            ) : feeAmounts.map(([raw, token], index) => <p key={index} className={cn("truncate text-sm font-medium text-white", index === 0 && "mt-1")}>{amount(raw, token)}</p>)}
          </div>
          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3"><p className="text-xs text-white/45">Current price</p><p className="mt-1 text-sm font-medium text-white">{position.currentTick === undefined ? "Unavailable" : formatPriceLabel({ pool: poolState, tick: position.currentTick })}</p></div>
          <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3"><p className="text-xs text-white/45">Pool share</p><p className="mt-1 text-sm font-medium text-white">{formatPercentage(share)}</p></div>
        </div>
      </div>
    </button>
    {open ? (
      <CardContent className="space-y-5 border-t border-white/10 px-5 py-5 sm:px-6">
        <PositionRange position={position} poolState={poolState} lowTick={lowTick} highTick={highTick} displayInverted={displayTokenOrientation.inverted} />
        <PositionActions position={position} token0={token0} token1={token1} displayInverted={displayTokenOrientation.inverted} managerAddress={managerAddress} managerAbi={managerAbi} routerAddress={routerAddress} routerAbi={routerAbi} ledgerAddress={ledgerAddress} deadline={deadline} portfolio={portfolio} veCollections={veCollections} clGauges={clGauges} rewardTokenMeta={rewardTokenMeta} />
      </CardContent>
    ) : null}
  </Card>;
}

export function LiquidityPositions() {
  const chainId = useChainId(); const portfolio = usePortfolioSummary(); const liquidity = portfolio.domains.liquidity;
  const { deadline } = useChainDeadline();
  const registry = useMemo(() => getPortfolioRegistry(chainId), [chainId]);
  const router = getContractConfig(chainId, "AuroveZapRouter");
  const positions = useMemo(
    () => Object.values(liquidity.data?.positions ?? {}).sort((a, b) => {
      if (a.isStaked !== b.isStaked) return a.isStaked ? -1 : 1;
      if (a.liquidity === 0n && b.liquidity !== 0n) return 1;
      if (a.liquidity !== 0n && b.liquidity === 0n) return -1;
      return 0;
    }),
    [liquidity.data],
  );
  const tokens = useMemo(() => { const map = new Map<string, TokenMeta>(); [...Object.values(portfolio.data?.walletAssets ?? {}), ...Object.values(portfolio.data?.id20Balances ?? {})].forEach((token) => map.set(token.address.toLowerCase(), token)); return map; }, [portfolio.data]);
  const feeCount = positions.filter((position) => !position.isStaked && (position.tokensOwed0 > 0n || position.tokensOwed1 > 0n)).length;
  const stakedCount = positions.filter((position) => position.isStaked).length;
  const scrollToAdd = () => document.getElementById("available-pools")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const summaryParts = [
    `${positions.length} position${positions.length === 1 ? "" : "s"}`,
    feeCount > 0 ? `${feeCount} with uncollected fees` : null,
    stakedCount > 0 ? `${stakedCount} staked` : null,
  ].filter(Boolean);
  return <section className="space-y-4" aria-labelledby="liquidity-positions-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="liquidity-positions-title" className="text-2xl font-semibold text-white">Your liquidity positions</h2><p className="mt-1 text-sm text-white/55">{summaryParts.join(" · ")}</p></div><Button variant="secondary" size="sm" onClick={() => void liquidity.refetch()} disabled={liquidity.isFetching}><RefreshCw className={cn("h-4 w-4", liquidity.isFetching && "animate-spin")} /> Refresh</Button></div>
    {liquidity.isLoading ? <div className="grid gap-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div> : positions.length === 0 ? <Card className="border-dashed border-white/15 bg-white/[0.025]"><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/5"><Droplets className="h-6 w-6 text-white/55" /></span><h3 className="mt-4 text-lg font-semibold text-white">No liquidity positions</h3><p className="mt-1 max-w-sm text-sm text-white/55">Add liquidity to an Aurove pool to start earning swap fees.</p><Button className="mt-5" onClick={scrollToAdd}>Add liquidity</Button></CardContent></Card> : registry?.positionManager && router?.address ? <div className="grid gap-4"><AggregateFeeCollection positions={positions} tokens={tokens} managerAddress={registry.positionManager.address} managerAbi={registry.positionManager.abi as Abi} />{positions.map((position, index) => <LiquidityPositionCard key={position.tokenId.toString()} position={position} tokens={tokens} managerAddress={registry.positionManager!.address} managerAbi={registry.positionManager!.abi as Abi} routerAddress={router.address!} routerAbi={router.abi as Abi} ledgerAddress={registry.ledger} deadline={deadline} portfolio={portfolio.data} veCollections={portfolio.domains.wallet.data?.veCollections ?? {}} clGauges={registry.clGauges} defaultOpen={index === 0} />)}</div> : <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Position management is not configured on this network.</p>}
    {liquidity.data?.meta.failures.length ? <p className="text-xs text-amber-100/65">Some position details are temporarily unavailable. Confirmed values remain visible.</p> : null}
  </section>;
}
