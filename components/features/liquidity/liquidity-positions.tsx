"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ChevronDown, ChevronUp, Coins, Droplets, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type Abi, type Address } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, cn } from "@ui";
import { getPortfolioRegistry, useId20Portfolio, useLiquidityPortfolio, useWalletPortfolio, type LiquidityPortfolio, type PortfolioDomain } from "@/features/portfolio";
import TransactionFlowButton, { type TransactionFlowButtonHandle } from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, type TxStep } from "@/lib/tx-flow";
import { formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import {
  formatPriceLabel,
  getDisplayPriceRangeTicks,
  getDisplayTokenOrientation,
  type SlipstreamPoolState,
} from "./slipstream-adapter";

const UINT128_MAX = (1n << 128n) - 1n;
const DEFAULT_SLIPPAGE_BPS = 50;

type Position = LiquidityPortfolio["positions"][string];
type TokenMeta = { symbol: string; decimals: number; address: Address };

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

function TokenPair({ token0, token1 }: { token0?: TokenMeta; token1?: TokenMeta }) {
  const family = (token: TokenMeta | undefined) => token?.symbol.toUpperCase().includes("BTC") ? "BTC" : token?.symbol.toUpperCase().includes("MEZO") ? "MEZO" : token?.symbol.toUpperCase().includes("AUROVE") || token?.symbol.toLowerCase().startsWith("av") ? "Aurove" : "MUSD";
  const marks = [family(token0), family(token1)];
  return <div className="relative h-11 w-16 shrink-0">{marks.map((mark, index) => <span key={`${mark}-${index}`} className={cn("absolute grid overflow-hidden rounded-full border-2 border-[#10161c] bg-[#18222b]", index === 0 ? "left-0 top-0 h-11 w-11" : "bottom-0 right-0 h-7 w-7")}><Image src={`/tokens/${mark}.png`} alt="" width={44} height={44} className="h-full w-full object-cover" /></span>)}</div>;
}

function statusOf(position: Position) {
  if (position.liquidity === 0n) return { label: "Closed", help: "Closed — no active liquidity", tone: "border-white/15 bg-white/5 text-white/60" };
  if (position.currentTick === undefined) return { label: "Unavailable", help: "Pool status is temporarily unavailable", tone: "border-white/15 bg-white/5 text-white/60" };
  const active = position.currentTick >= position.tickLower && position.currentTick < position.tickUpper;
  return active
    ? { label: "In range", help: "In range — earning swap fees", tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" }
    : { label: "Out of range", help: "Out of range — not currently earning swap fees", tone: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
}

function ActionMessage({ success, error }: { success: string | null; error: string | null }) {
  if (!success && !error) return null;
  return <p role="status" className={cn("rounded-lg border px-3 py-2 text-xs", error ? "border-red-300/20 bg-red-300/10 text-red-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100")}>{error ?? success}</p>;
}

function PositionActions({ position, token0, token1, displayInverted, managerAddress, managerAbi }: { position: Position; token0?: TokenMeta; token1?: TokenMeta; displayInverted: boolean; managerAddress: Address; managerAbi: Abi }) {
  const { address } = useAccount();
  const removeTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const burnTransactionRef = useRef<TransactionFlowButtonHandle>(null);
  const [percent, setPercent] = useState("25");
  const [slippage, setSlippage] = useState((DEFAULT_SLIPPAGE_BPS / 100).toString());
  const [collectAfter, setCollectAfter] = useState(true);
  const [burnConfirmed, setBurnConfirmed] = useState(false);
  const [deadline] = useState(() => BigInt(Math.floor(Date.now() / 1000) + 86_400));
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const numericPercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const removeLiquidity = (position.liquidity * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated0 = position.rawAmount0 === undefined ? undefined : (position.rawAmount0 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const estimated1 = position.rawAmount1 === undefined ? undefined : (position.rawAmount1 * BigInt(Math.round(numericPercent * 100))) / 10_000n;
  const slippageBps = BigInt(Math.min(5_000, Math.max(0, Math.round((Number(slippage) || 0) * 100))));
  const min0 = estimated0 === undefined ? 0n : estimated0 * (10_000n - slippageBps) / 10_000n;
  const min1 = estimated1 === undefined ? 0n : estimated1 * (10_000n - slippageBps) / 10_000n;
  const canBurn = position.liquidity === 0n && position.tokensOwed0 === 0n && position.tokensOwed1 === 0n;
  const estimatedAmounts = displayInverted
    ? [[estimated1, token1], [estimated0, token0]] as const
    : [[estimated0, token0], [estimated1, token1]] as const;
  const feeAmounts = displayInverted
    ? [[position.tokensOwed1, token1], [position.tokensOwed0, token0]] as const
    : [[position.tokensOwed0, token0], [position.tokensOwed1, token1]] as const;

  const collectSteps = address ? [withDomains(makeAddressWriteStep({ key: "liquidity-collect-fees", label: "Collect fees", displayLabelBtn: true, address: managerAddress, abi: managerAbi, variables: { functionName: "collect", args: [{ tokenId: position.tokenId, recipient: address, amount0Max: UINT128_MAX, amount1Max: UINT128_MAX }] } }) as TxStep, ["liquidity", "wallet", "id20"])] : [];
  const removeSteps = address && removeLiquidity > 0n ? [withDomains(makeAddressWriteStep({ key: "liquidity-remove", label: numericPercent === 100 ? "Remove all liquidity" : "Remove liquidity", displayLabelBtn: true, address: managerAddress, abi: managerAbi, variables: { functionName: "decreaseLiquidity", args: [{ tokenId: position.tokenId, liquidity: removeLiquidity, amount0Min: min0, amount1Min: min1, deadline }] } }) as TxStep, ["liquidity", "wallet", "id20"]), ...(collectAfter ? collectSteps : [])] : [];

  const complete = (message: string) => () => { setError(null); setSuccess(message); };
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

  return <div className="grid gap-4 pt-2 lg:grid-cols-2">
    <form onSubmit={removeFormik.handleSubmit} noValidate className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
      <div><h4 className="font-medium text-white">Remove liquidity</h4><p className="text-xs text-white/50">Partially or fully withdraw the active position.</p></div>
      <div className="grid grid-cols-4 gap-2">{[25, 50, 75, 100].map((preset) => <Button key={preset} type="button" size="sm" variant={numericPercent === preset ? "default" : "secondary"} onClick={() => { setPercent(String(preset)); void removeFormik.setFieldValue("percent", String(preset)); }}>{preset === 100 ? "Max" : `${preset}%`}</Button>)}</div>
      <label className="block text-xs text-white/60">Percentage<Input name="percent" value={percent} onBlur={removeFormik.handleBlur} onChange={(event) => { setPercent(event.target.value); void removeFormik.setFieldValue("percent", event.target.value); }} inputMode="decimal" className="mt-1" /></label>
      <div className="grid grid-cols-2 gap-2 text-xs">{estimatedAmounts.map(([raw, token], index) => <span key={index} className="rounded-lg bg-white/5 p-2">Est. {amount(raw, token)}</span>)}</div>
      <label className="block text-xs text-white/60">Slippage tolerance (%)<Input name="slippage" value={slippage} onBlur={removeFormik.handleBlur} onChange={(event) => { setSlippage(event.target.value); void removeFormik.setFieldValue("slippage", event.target.value); }} inputMode="decimal" className="mt-1" /></label>
      <label className="flex items-center gap-2 text-xs text-white/65"><input name="collectAfter" type="checkbox" checked={collectAfter} onChange={(event) => { setCollectAfter(event.target.checked); void removeFormik.setFieldValue("collectAfter", event.target.checked); }} /> Collect owed tokens after removal</label>
      {removeFormik.submitCount > 0 && (removeFormik.errors.percent || removeFormik.errors.slippage) ? <p role="alert" className="text-xs text-red-200">{removeFormik.errors.percent ?? removeFormik.errors.slippage}</p> : null}
      <TransactionFlowButton ref={removeTransactionRef} type="submit" className="w-full" steps={removeSteps} disabled={removeLiquidity <= 0n} onComplete={complete(numericPercent === 100 ? "Liquidity fully removed. The NFT was not burned." : "Liquidity partially removed.")} onError={failed}>Preview and remove</TransactionFlowButton>
    </form>
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
      <div><h4 className="font-medium text-white">Uncollected fees</h4><p className="text-xs text-white/50">Sent directly to {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "your wallet"}.</p></div>
      <div className="grid grid-cols-2 gap-2 text-sm">{feeAmounts.map(([raw, token], index) => <span key={index}>{amount(raw, token)}</span>)}</div>
      <TransactionFlowButton className="w-full" steps={collectSteps} disabled={position.tokensOwed0 === 0n && position.tokensOwed1 === 0n} onComplete={complete("Fees collected.")} onError={failed}><Coins className="h-4 w-4" /> Collect fees</TransactionFlowButton>
      <div className="border-t border-white/10 pt-3"><p className="text-xs text-white/50">Increase liquidity uses this NFT’s exact range. The current add-liquidity router only mints new positions, so increasing is disabled until its position-aware method is configured.</p><Button className="mt-2 w-full" variant="secondary" disabled><Plus className="h-4 w-4" /> Increase liquidity</Button></div>
      {canBurn ? <form onSubmit={burnFormik.handleSubmit} noValidate className="border-t border-white/10 pt-3"><label className="flex items-start gap-2 text-xs text-white/65"><input name="burnConfirmed" type="checkbox" checked={burnConfirmed} onChange={(event) => { setBurnConfirmed(event.target.checked); void burnFormik.setFieldValue("burnConfirmed", event.target.checked); }} /> I confirm this empty NFT should be permanently burned.</label>{burnFormik.submitCount > 0 && burnFormik.errors.burnConfirmed ? <p role="alert" className="mt-2 text-xs text-red-200">{burnFormik.errors.burnConfirmed}</p> : null}<TransactionFlowButton ref={burnTransactionRef} type="submit" className="mt-2 w-full" variant="secondary" disabled={!burnConfirmed} steps={[withDomains(makeAddressWriteStep({ key: "liquidity-burn-position", label: "Burn empty position NFT", address: managerAddress, abi: managerAbi, variables: { functionName: "burn", args: [position.tokenId] } }) as TxStep, ["liquidity"])]} onComplete={complete("Empty position NFT burned.")} onError={failed}><Trash2 className="h-4 w-4" /> Burn empty NFT</TransactionFlowButton></form> : null}
      <ActionMessage success={success} error={error} />
    </div>
  </div>;
}

function LiquidityPositionCard({ position, tokens, managerAddress, managerAbi }: { position: Position; tokens: Map<string, TokenMeta>; managerAddress: Address; managerAbi: Abi }) {
  const [open, setOpen] = useState(false);
  const token0 = tokens.get(position.token0.toLowerCase()); const token1 = tokens.get(position.token1.toLowerCase());
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
  return <Card className="overflow-hidden border-white/10 bg-white/[0.035]">
    <button type="button" className="w-full text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><TokenPair token0={displayToken0} token1={displayToken1} /><div><CardTitle className="text-lg">{displayToken0?.symbol ?? "Token 0"} / {displayToken1?.symbol ?? "Token 1"}</CardTitle><CardDescription>{position.poolKey} · Tick spacing {position.tickSpacing} · NFT #{position.tokenId.toString()}</CardDescription></div></div><div className="flex items-center gap-2"><Badge className={status.tone}>{status.label}</Badge>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div></CardHeader>
      <CardContent className="grid gap-3 border-t border-white/8 pt-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-white/45">Deposited</p>{depositedAmounts.map(([raw, token], index) => <p key={index} className={index === 0 ? "mt-1 text-sm text-white" : "text-sm text-white"}>{amount(raw, token)}</p>)}</div><div><p className="text-xs text-white/45">Uncollected fees</p>{feeAmounts.map(([raw, token], index) => <p key={index} className={index === 0 ? "mt-1 text-sm text-white" : "text-sm text-white"}>{amount(raw, token)}</p>)}</div><div><p className="text-xs text-white/45">Current price</p><p className="mt-1 text-sm text-white">{position.currentTick === undefined ? "Unavailable" : formatPriceLabel({ pool: poolState, tick: position.currentTick })}</p></div><div><p className="text-xs text-white/45">Pool share</p><p className="mt-1 text-sm text-white">{formatPercentage(share)}</p></div></CardContent>
    </button>
    {open ? <CardContent className="space-y-4 border-t border-white/10 pt-5"><p className="text-sm text-white/65">{status.help}</p><div className="grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-white/45">Minimum price</p><p>{formatPriceLabel({ pool: poolState, tick: lowTick })}</p></div><div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-white/45">Current pool price</p><p>{position.currentTick === undefined ? "Unavailable" : formatPriceLabel({ pool: poolState, tick: position.currentTick })}</p></div><div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-white/45">Maximum price</p><p>{formatPriceLabel({ pool: poolState, tick: highTick })}</p></div></div><PositionActions position={position} token0={token0} token1={token1} displayInverted={displayTokenOrientation.inverted} managerAddress={managerAddress} managerAbi={managerAbi} /></CardContent> : null}
  </Card>;
}

export function LiquidityPositions() {
  const chainId = useChainId(); const liquidity = useLiquidityPortfolio(); const wallet = useWalletPortfolio(); const id20 = useId20Portfolio();
  const registry = useMemo(() => getPortfolioRegistry(chainId), [chainId]);
  const positions = useMemo(() => Object.values(liquidity.data?.positions ?? {}), [liquidity.data]);
  const tokens = useMemo(() => { const map = new Map<string, TokenMeta>(); [...Object.values(wallet.data?.assets ?? {}), ...Object.values(id20.data?.balances ?? {})].forEach((token) => map.set(token.address.toLowerCase(), token)); return map; }, [wallet.data, id20.data]);
  const feeCount = positions.filter((position) => position.tokensOwed0 > 0n || position.tokensOwed1 > 0n).length;
  const scrollToAdd = () => document.getElementById("available-pools")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return <section className="space-y-4" aria-labelledby="liquidity-positions-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="liquidity-positions-title" className="text-2xl font-semibold text-white">Your liquidity positions</h2><p className="mt-1 text-sm text-white/55">{positions.length} position{positions.length === 1 ? "" : "s"} · {feeCount} with uncollected fees</p></div><Button variant="secondary" size="sm" onClick={() => void liquidity.refetch()} disabled={liquidity.isFetching}><RefreshCw className={cn("h-4 w-4", liquidity.isFetching && "animate-spin")} /> Refresh</Button></div>
    {liquidity.isLoading ? <div className="grid gap-4"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div> : positions.length === 0 ? <Card className="border-dashed border-white/15 bg-white/[0.025]"><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-white/5"><Droplets className="h-6 w-6 text-white/55" /></span><h3 className="mt-4 text-lg font-semibold text-white">No liquidity positions</h3><p className="mt-1 max-w-sm text-sm text-white/55">Add liquidity to an Aurove pool to start earning swap fees.</p><Button className="mt-5" onClick={scrollToAdd}>Add liquidity</Button></CardContent></Card> : registry?.positionManager ? <div className="grid gap-4">{positions.map((position) => <LiquidityPositionCard key={position.tokenId.toString()} position={position} tokens={tokens} managerAddress={registry.positionManager!.address} managerAbi={registry.positionManager!.abi as Abi} />)}</div> : <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">Position management is not configured on this network.</p>}
    {liquidity.data?.meta.failures.length ? <p className="text-xs text-amber-100/65">Some position details are temporarily unavailable. Confirmed values remain visible.</p> : null}
  </section>;
}
