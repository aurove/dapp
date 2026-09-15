"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Coins, Droplets, RefreshCw } from "lucide-react";
import { encodeFunctionData, type Abi, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardTitle, Skeleton, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import {
  getPortfolioRegistry,
  usePortfolioSummary,
  type PortfolioSummary,
  type WalletPortfolio,
} from "@/features/portfolio";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, type TxStep } from "@/lib/tx-flow";
import { useChainDeadline } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import {
  formatPriceLabel,
  getDisplayPriceRangeTicks,
  getDisplayTokenOrientation,
  type SlipstreamPoolState,
} from "./slipstream-adapter";
import {
  amount,
  formatPercentage,
  statusOf,
  TokenMark,
  TokenPair,
  type Position,
  type TokenMeta,
} from "./position-display";
import { PositionManagePanel } from "./position-management";
import { UINT128_MAX, withPortfolioDomains } from "./position-management/tx";
import type { ClGauge } from "./position-management/shared";

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
    ? [withPortfolioDomains(makeAddressWriteStep({
      key: "liquidity-collect-all-fees",
      label: "Collect all fees",
      displayLabelBtn: true,
      address: managerAddress,
      abi: managerAbi,
      variables: { functionName: "multicall", args: [collectCalls] },
    }) as TxStep, ["liquidity", "wallet", "id20"])]
    : [];

  return (
    <Card className="border-white/10 bg-gradient-to-r from-emerald-300/[0.045] via-white/[0.025] to-transparent">
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
          {feeTotals.length > 0 ? feeTotals.map(([tokenAddress, total], index) => (
            <div key={tokenAddress} className={cn("flex min-w-36 flex-1 items-center gap-2 px-4 py-2", index > 0 && "border-l border-white/10")}>
              <TokenMark token={total.token} className="h-7 w-7" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{total.token ? formatCompactRawTokenAmount(total.raw, total.token.decimals, null) : total.raw.toString()}</p>
                <p className="truncate text-xs text-white/55">{total.token?.symbol ?? `${tokenAddress.slice(0, 6)}…${tokenAddress.slice(-4)}`}</p>
              </div>
            </div>
          )) : <p className="px-4 py-3 text-sm text-white/45">Your collected fee totals will appear here.</p>}
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
    </Card>
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

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-4 sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[160px_1fr] lg:items-start">
        <div className="lg:pt-1">
          <p className="text-sm text-white/65">{status.help}</p>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {values.map((item) => (
              <div key={item.label}>
                <p className={cn("truncate text-xs font-medium sm:text-sm", item.tone)}>{item.value}</p>
                <p className="mt-0.5 text-[11px] text-white/45">{item.label}</p>
              </div>
            ))}
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
    </div>
  );
}

function LiquidityPositionCard({
  position,
  tokens,
  managerAddress,
  managerAbi,
  routerAddress,
  routerAbi,
  ledgerAddress,
  deadline,
  portfolio,
  veCollections,
  clGauges,
  defaultOpen = false,
}: {
  position: Position;
  tokens: Map<string, TokenMeta>;
  managerAddress: Address;
  managerAbi: Abi;
  routerAddress: Address;
  routerAbi: Abi;
  ledgerAddress: Address;
  deadline: bigint | null;
  portfolio?: PortfolioSummary;
  veCollections: WalletPortfolio["veCollections"];
  clGauges: readonly ClGauge[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const token0 = tokens.get(position.token0.toLowerCase());
  const token1 = tokens.get(position.token1.toLowerCase());
  const rewardTokenMeta = position.rewardToken ? tokens.get(position.rewardToken.toLowerCase()) : undefined;
  const status = statusOf(position);
  const poolState: SlipstreamPoolState = {
    chainId: 0,
    address: position.pool,
    token0: token0 ? { ...token0, name: token0.symbol } : null,
    token1: token1 ? { ...token1, name: token1.symbol } : null,
    currentTick: position.currentTick ?? null,
    sqrtPriceX96: position.sqrtPriceX96 ?? null,
    tickSpacing: position.tickSpacing,
  };
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

  return (
    <Card className="overflow-hidden border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.025] to-transparent">
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
            <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3">
              <p className="text-xs text-white/45">Deposited</p>
              {depositedAmounts.map(([raw, token], index) => (
                <p key={index} className={cn("truncate text-sm font-medium text-white", index === 0 && "mt-1")}>{amount(raw, token)}</p>
              ))}
            </div>
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
              ) : feeAmounts.map(([raw, token], index) => (
                <p key={index} className={cn("truncate text-sm font-medium text-white", index === 0 && "mt-1")}>{amount(raw, token)}</p>
              ))}
            </div>
            <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3">
              <p className="text-xs text-white/45">Current price</p>
              <p className="mt-1 text-sm font-medium text-white">{position.currentTick === undefined ? "Unavailable" : formatPriceLabel({ pool: poolState, tick: position.currentTick })}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3">
              <p className="text-xs text-white/45">Pool share</p>
              <p className="mt-1 text-sm font-medium text-white">{formatPercentage(share)}</p>
            </div>
          </div>
        </div>
      </button>
      {open ? (
        <CardContent className="space-y-5 border-t border-white/10 px-5 py-5 sm:px-6">
          <PositionRange position={position} poolState={poolState} lowTick={lowTick} highTick={highTick} displayInverted={displayTokenOrientation.inverted} />
          <PositionManagePanel
            position={position}
            token0={token0}
            token1={token1}
            displayInverted={displayTokenOrientation.inverted}
            managerAddress={managerAddress}
            managerAbi={managerAbi}
            routerAddress={routerAddress}
            routerAbi={routerAbi}
            ledgerAddress={ledgerAddress}
            deadline={deadline}
            portfolio={portfolio}
            veCollections={veCollections}
            clGauges={clGauges}
            rewardTokenMeta={rewardTokenMeta}
          />
        </CardContent>
      ) : null}
    </Card>
  );
}

export function LiquidityPositions() {
  const chainId = useChainId();
  const portfolio = usePortfolioSummary();
  const liquidity = portfolio.domains.liquidity;
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
  const tokens = useMemo(() => {
    const map = new Map<string, TokenMeta>();
    [...Object.values(portfolio.data?.walletAssets ?? {}), ...Object.values(portfolio.data?.id20Balances ?? {})].forEach((token) => {
      map.set(token.address.toLowerCase(), token);
    });
    return map;
  }, [portfolio.data]);
  const feeCount = positions.filter((position) => !position.isStaked && (position.tokensOwed0 > 0n || position.tokensOwed1 > 0n)).length;
  const stakedCount = positions.filter((position) => position.isStaked).length;
  const scrollToAdd = () => document.getElementById("available-pools")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const summaryParts = [
    `${positions.length} position${positions.length === 1 ? "" : "s"}`,
    feeCount > 0 ? `${feeCount} with uncollected fees` : null,
    stakedCount > 0 ? `${stakedCount} staked` : null,
  ].filter(Boolean);

  return (
    <section className="space-y-4" aria-labelledby="liquidity-positions-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="liquidity-positions-title" className="text-2xl font-semibold text-white">Your liquidity positions</h2>
          <p className="mt-1 text-sm text-white/55">{summaryParts.join(" · ")}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void liquidity.refetch()} disabled={liquidity.isFetching}>
          <RefreshCw className={cn("h-4 w-4", liquidity.isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>
      {liquidity.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : positions.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-white/[0.025]">
          <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/5"><Droplets className="h-6 w-6 text-white/55" /></span>
            <h3 className="mt-4 text-lg font-semibold text-white">No liquidity positions</h3>
            <p className="mt-1 max-w-sm text-sm text-white/55">Add liquidity to an Aurove pool to start earning swap fees.</p>
            <Button className="mt-5" onClick={scrollToAdd}>Add liquidity</Button>
          </CardContent>
        </Card>
      ) : registry?.positionManager && router?.address ? (
        <div className="grid gap-4">
          <AggregateFeeCollection positions={positions} tokens={tokens} managerAddress={registry.positionManager.address} managerAbi={registry.positionManager.abi as Abi} />
          {positions.map((position, index) => (
            <LiquidityPositionCard
              key={position.tokenId.toString()}
              position={position}
              tokens={tokens}
              managerAddress={registry.positionManager!.address}
              managerAbi={registry.positionManager!.abi as Abi}
              routerAddress={router.address!}
              routerAbi={router.abi as Abi}
              ledgerAddress={registry.ledger}
              deadline={deadline}
              portfolio={portfolio.data}
              veCollections={portfolio.domains.wallet.data?.veCollections ?? {}}
              clGauges={registry.clGauges}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Position management is not configured on this network.</p>
      )}
      {liquidity.data?.meta.failures.length ? (
        <p className="text-xs text-amber-100/65">Some position details are temporarily unavailable. Confirmed values remain visible.</p>
      ) : null}
    </section>
  );
}
