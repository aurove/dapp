"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Check, ChevronDown, ChevronUp, LoaderCircle, Search, Settings2, XCircle } from "lucide-react";
import { formatUnits, parseUnits, zeroAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Input, ScrollArea, cn,
} from "@ui";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { formatUnitsDecimal } from "@/lib/formatting/decimal";
import { useChainTime } from "@/lib/web3/use-chain-time";
import {
  findClRoute, planSwap, useSwapApproval, useSwapAssets, useSwapExecution, useSwapNetworkFee, useSwapQuote,
  useSwapRegistry, type SwapAsset, type SwapExecutionPlan, type SwapIntent, type SwapTradeType,
} from "@/features/swap";

const QUOTE_EXPIRY_SECONDS = 30n;

function formLabel(asset: SwapAsset): string {
  if (asset.form === "underlying") return "· Underlying ";
  if (asset.form === "venft") return "";
  if (asset.form === "tranche") return "";
  if (asset.form === "id20") return "· Liquid ID20 / ERC20";
  return "· Liquid ERC20";
}

function amountText(value: bigint | undefined, asset: SwapAsset | undefined): string {
  if (value === undefined || !asset) return "";
  return formatUnitsDecimal(value, asset.decimals, 6);
}

function safeParse(value: string, decimals: number): bigint | null {
  if (!value || value === ".") return 0n;
  try { return parseUnits(value, decimals); } catch { return null; }
}

function normalizeAmount(value: string, decimals: number): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, decimals)}` : whole;
}

function boundedNumber(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function TokenMark({ asset }: { asset: SwapAsset }) {
  return <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] font-bold", asset.form === "underlying" || asset.form === "venft" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : asset.form === "tranche" ? "border-sky-300/30 bg-sky-300/10 text-sky-100" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100")}>{asset.symbol.slice(0, 3)}</span>;
}

function assetGroupLabel(side: "Sell" | "Buy", asset: SwapAsset): string {
  if (side === "Sell") {
    if (asset.form === "venft") return "veNFT positions";
    if (asset.form === "tranche") return "Ledger tranches";
    return "ERC-20 tokens";
  }
  return asset.form === "id20" ? "ID20 tokens" : "Other ERC-20 tokens";
}

function AssetSelector({ side, asset, assets, balanceOf, balancesLoading, onSelect }: { side: "Sell" | "Buy"; asset?: SwapAsset; assets: readonly SwapAsset[]; balanceOf: (asset: SwapAsset) => bigint; balancesLoading?: boolean; onSelect: (asset: SwapAsset) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((option) => [option.symbol, option.name, option.address, option.trancheId?.toString(), option.tokenId?.toString()].some((value) => value?.toLowerCase().includes(query)));
  }, [assets, search]);
  const groups = useMemo(() => {
    const grouped = new Map<string, SwapAsset[]>();
    filteredAssets.forEach((option) => {
      const label = assetGroupLabel(side, option);
      grouped.set(label, [...(grouped.get(label) ?? []), option]);
    });
    return [...grouped.entries()];
  }, [filteredAssets, side]);
  return <>
    <Button type="button" variant="secondary" className="h-11 max-w-[48%] shrink-0 rounded-full px-2.5" onClick={() => setOpen(true)}>
      {asset ? <><TokenMark asset={asset} /><span className="truncate font-semibold">{asset.symbol}</span></> : "Select token"}
      <ChevronDown className="h-4 w-4" />
    </Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden border-white/12 bg-[#111820]">
        <DialogHeader><DialogTitle>Select an asset to {side.toLowerCase()}</DialogTitle><DialogDescription>{side === "Buy" ? "ID20 representations are listed first, followed by every other ERC-20 available through a Mezo CL route." : "Aurove veNFTs and Ledger tranches are listed first, followed by ERC-20s available through a Mezo CL route."}</DialogDescription></DialogHeader>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search symbol, name, ID, or address" aria-label="Search assets" className="pl-9" /></div>
        <div className="flex items-center justify-between text-xs text-white/38"><span>{filteredAssets.length} asset{filteredAssets.length === 1 ? "" : "s"}</span>{search ? <button type="button" className="text-[#d8b884] hover:text-[#efd39e]" onClick={() => setSearch("")}>Clear search</button> : null}</div>
        <ScrollArea className="max-h-[55vh] pr-3"><div className="space-y-4">
          {groups.map(([label, options]) => <section key={label} aria-label={label}><p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</p><div className="space-y-2">{options.map((option) => <button key={option.id} type="button" onClick={() => { onSelect(option); setOpen(false); setSearch(""); }} className={cn("flex w-full min-w-0 items-center justify-start gap-3 overflow-hidden rounded-xl border p-3 text-left whitespace-normal transition", option.id === asset?.id ? "border-[#b58f5f]/60 bg-[#b58f5f]/12" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]")}>
              <TokenMark asset={option} />
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block truncate font-semibold text-white">{option.symbol}</span>
                <span className="block truncate text-xs text-white/48">{option.name} {formLabel(option)}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-white/55">
                <span className="block">{balancesLoading ? "…" : formatUnitsDecimal(balanceOf(option), option.decimals, 5)}</span>
                <span className="text-white/35">Balance</span>
              </span>
            </button>)}</div></section>)}
          {!filteredAssets.length ? <p className="p-5 text-center text-sm text-white/50">{search ? "No assets match your search." : "No valid assets for this side of the route."}</p> : null}
        </div></ScrollArea>
      </DialogContent>
    </Dialog>
  </>;
}

function AssetAmountField(props: { label: string; value: string; asset?: SwapAsset; assets: readonly SwapAsset[]; balance: bigint; balanceOf: (asset: SwapAsset) => bigint; balanceLoading?: boolean; readOnly?: boolean; onValue: (value: string) => void; onAsset: (asset: SwapAsset) => void; onMax?: () => void; fiat?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 focus-within:border-[#b58f5f]/45">
    <div className="mb-3 flex items-center justify-between text-xs"><span className="font-medium text-white/55">{props.label}</span><span className="text-white/45">Balance: {props.balanceLoading ? "…" : props.asset ? formatUnitsDecimal(props.balance, props.asset.decimals, 5) : "—"} {props.onMax && !props.balanceLoading ? <button type="button" onClick={props.onMax} className="ml-1 font-semibold text-[#d8b884] hover:text-[#efd39e]">Max</button> : null}</span></div>
    <div className="flex items-center gap-3"><Input aria-label={`${props.label} amount`} inputMode="decimal" value={props.value} readOnly={props.readOnly} placeholder="0" onChange={(event) => props.onValue(normalizeAmount(event.target.value, props.asset?.decimals ?? 18))} className="h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-3xl font-medium shadow-none focus-visible:ring-0" /><AssetSelector side={props.label as "Sell" | "Buy"} asset={props.asset} assets={props.assets} balanceOf={props.balanceOf} balancesLoading={props.balanceLoading} onSelect={props.onAsset} /></div>
    <div className="mt-1 min-h-4 text-xs text-white/38">{props.fiat ?? (props.asset ? props.asset.name : "")}</div>
  </div>;
}

function DetailRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-white/48">{label}</span><span className="text-right font-medium text-white/82">{value}</span></div>; }

export function SwapPage() {
  const account = useAccount();
  const registryQuery = useSwapRegistry();
  const registry = registryQuery.data;
  const [sellId, setSellId] = useState<string>();
  const [buyId, setBuyId] = useState<string>();
  const [tradeType, setTradeType] = useState<SwapTradeType>("exactInput");
  const [typedAmount, setTypedAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [deadlineMinutes, setDeadlineMinutes] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { chainTimestamp, isChainTimeLoading } = useChainTime();

  const resolvedSellId = sellId ?? registry?.assets.find((asset) => asset.id === "erc20:MUSD")?.id ?? registry?.assets[0]?.id;
  const sell = registry?.assets.find((asset) => asset.id === resolvedSellId);
  const routedDefaultBuy = registry && sell
    ? registry.assets.find((asset) => asset.form === "id20" && Boolean(findClRoute(registry.pools, sell.executableAddress, asset.executableAddress)))
    ?? registry.assets.find((asset) => asset.form === "erc20" && asset.id !== sell.id && Boolean(findClRoute(registry.pools, sell.executableAddress, asset.executableAddress)))
    : undefined;
  const resolvedBuyId = buyId ?? routedDefaultBuy?.id;
  const buy = registry?.assets.find((asset) => asset.id === resolvedBuyId);
  const sellAssets = useSwapAssets(registry, buy, "sell");
  const buyAssets = useSwapAssets(registry, sell, "buy");
  const parsedAmount = safeParse(typedAmount, (tradeType === "exactInput" ? sell : buy)?.decimals ?? 18);
  const deadline = chainTimestamp === null ? undefined : chainTimestamp + BigInt(Math.round(deadlineMinutes * 60));
  const intent = useMemo<SwapIntent | undefined>(() => sell && buy && deadline !== undefined && parsedAmount !== null && parsedAmount > 0n ? {
    chainId: registry!.chainId, account: (account.address ?? zeroAddress) as Address,
    tokenIn: sell, tokenOut: buy, tradeType, amount: parsedAmount, slippageBps,
    recipient: (account.address ?? zeroAddress) as Address, deadline,
  } : undefined, [account.address, buy, deadline, parsedAmount, registry, sell, slippageBps, tradeType]);
  const preliminaryPlan = useMemo<SwapExecutionPlan | undefined>(() => intent && registry ? planSwap(intent, registry) : undefined, [intent, registry]);
  const quote = useSwapQuote({ registry, plan: preliminaryPlan, tradeType, amount: parsedAmount ?? 0n, account: account.address, slippageBps });
  const plan = useMemo(() => intent && registry && quote.data ? planSwap(intent, registry, quote.data) : preliminaryPlan, [intent, preliminaryPlan, quote.data, registry]);
  const supportedPlan = plan && plan.type !== "unsupported" ? plan : undefined;
  const approval = useSwapApproval(plan, registry);
  const networkFee = useSwapNetworkFee(plan, approval.isApproved);
  const execution = useSwapExecution({ plan, quote: quote.data, verifyApproval: approval.verify });
  const sellBalance = sell ? sellAssets.balanceOf(sell) : 0n;
  const buyBalance = buy ? buyAssets.balanceOf(buy) : 0n;
  const requiredBalance = quote.data ? (tradeType === "exactOutput" && supportedPlan ? supportedPlan.amountInMaximum : quote.data.amountIn) : 0n;
  const insufficient = requiredBalance > sellBalance;
  const outputValue = tradeType === "exactInput" ? amountText(quote.data?.amountOut, buy) : typedAmount;
  const inputValue = tradeType === "exactOutput" ? amountText(quote.data?.amountIn, sell) : typedAmount;
  const fiatFor = (asset: SwapAsset | undefined, value: string) => asset?.symbol === "MUSD" && value ? `≈ $${value}` : undefined;
  const reverseBuyAsset = sell?.form === "underlying" || sell?.form === "venft" || sell?.form === "tranche"
    ? registry?.assets.find((asset) => asset.form === "id20" && asset.executableAddress.toLowerCase() === sell.executableAddress.toLowerCase())
    : sell;
  const canReverse = Boolean(registry && buy && reverseBuyAsset && findClRoute(registry.pools, buy.executableAddress, reverseBuyAsset.executableAddress));

  const chooseSell = (asset: SwapAsset) => { setSellId(asset.id); setTradeType("exactInput"); setTypedAmount(asset.fixedInputAmount ? formatUnits(asset.fixedInputAmount, asset.decimals) : ""); };
  const chooseBuy = (asset: SwapAsset) => { setBuyId(asset.id); setTypedAmount(sell?.fixedInputAmount ? formatUnits(sell.fixedInputAmount, sell.decimals) : ""); };
  const reverse = () => {
    if (!buy || !reverseBuyAsset || !canReverse) return;
    setSellId(buy.id); setBuyId(reverseBuyAsset.id); setTradeType("exactInput"); setTypedAmount("");
  };
  const setMax = () => { if (!sell) return; setTradeType("exactInput"); setTypedAmount(formatUnits(sellBalance, sell.decimals)); };
  const onSellValue = (value: string) => { setTradeType("exactInput"); setTypedAmount(value); };
  const onBuyValue = (value: string) => { if (sell?.form === "venft") return; setTradeType("exactOutput"); setTypedAmount(value); };
  const price = quote.data && quote.data.amountIn > 0n && quote.data.amountOut > 0n && sell && buy
    ? `${formatUnitsDecimal(quote.data.amountOut * (10n ** BigInt(sell.decimals)) / quote.data.amountIn, buy.decimals, 6)} ${buy.symbol} per ${sell.symbol}` : "—";
  const inversePrice = quote.data && quote.data.amountOut > 0n && sell && buy
    ? `${formatUnitsDecimal(quote.data.amountIn * (10n ** BigInt(buy.decimals)) / quote.data.amountOut, sell.decimals, 6)} ${sell.symbol} per ${buy.symbol}` : "—";
  const routeSymbol = (token: Address) => registry?.assets.find((asset) => (asset.form === "erc20" || asset.form === "id20") && asset.executableAddress.toLowerCase() === token.toLowerCase())?.symbol ?? "Pool";
  const routeText = supportedPlan ? [routeSymbol(supportedPlan.hops[0].tokenIn), ...supportedPlan.hops.map((hop) => routeSymbol(hop.tokenOut))].join(" → ") : "—";
  const quoteExpired = Boolean(quote.data && chainTimestamp !== null && chainTimestamp - quote.data.quotedAtBlockTimestamp > QUOTE_EXPIRY_SECONDS);
  const action = (() => {
    if (!registry && registryQuery.isLoading) return { label: "Loading markets…", disabled: true };
    if (!registry) return { label: registryQuery.isError ? "Unable to load markets" : "Unsupported network", disabled: true };
    if (isChainTimeLoading || chainTimestamp === null) return { label: "Reading blockchain time…", disabled: true, loading: true };
    if (!sell || !buy) return { label: "Select tokens", disabled: true };
    if (!typedAmount) return { label: "Enter an amount", disabled: true };
    if (parsedAmount === null || parsedAmount <= 0n) return { label: "Invalid amount", disabled: true };
    if (preliminaryPlan?.type === "unsupported") return { label: preliminaryPlan.reason === "No route available" ? "No route available" : preliminaryPlan.reason, disabled: true };
    if (quote.isDebouncing || quote.isFetching) return { label: "Fetching quote…", disabled: true, loading: true };
    if (quote.isError || !quote.data) return { label: "No route available", disabled: true };
    if (quoteExpired) return { label: "Quote expired — refresh", disabled: false, refresh: true };
    if (insufficient) return { label: `Insufficient ${sell.symbol} balance`, disabled: true };
    if (approval.isChecking) return { label: "Checking approval…", disabled: true, loading: true };
    if (!approval.isApproved) return { label: approval.isApproving ? "Approving…" : `Approve ${sell.symbol}`, disabled: approval.isApproving, approve: true, loading: approval.isApproving };
    return { label: "Review swap", disabled: false };
  })();
  const handleAction = () => { if (action.approve) void approval.approve(); else if (action.refresh) void quote.refetch(); else execution.review(); };

  return <div className="mx-auto w-full max-w-[500px] rounded-[28px] border border-white/12 bg-[rgba(13,19,25,0.94)] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-4" aria-label="Aurove swap">
    <div className="flex items-center justify-between px-2 pb-3 pt-1"><div><h2 className="text-lg font-semibold text-white">Swap</h2><p className="flex items-center gap-1.5 text-xs text-white/42" aria-live="polite">Aurove and Tigris liquidity{registry && registryQuery.isError ? <><span>·</span><span className="text-amber-200/75">Using cached markets</span></> : registry && registryQuery.isFetching ? <><span>·</span><LoaderCircle className="h-3 w-3 animate-spin" /><span>Refreshing markets</span></> : null}</p></div><Button type="button" size="icon" variant="ghost" onClick={() => setSettingsOpen((value) => !value)} aria-label="Swap settings"><Settings2 className="h-4 w-4" /></Button></div>
    {settingsOpen ? <div className="mb-3 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs"><label className="space-y-1 text-white/55"><span>Slippage tolerance</span><span className="flex items-center gap-1"><Input inputMode="decimal" value={(slippageBps / 100).toString()} onChange={(event) => setSlippageBps(Math.round(boundedNumber(event.target.value, 0.01, 50, 0.5) * 100))} className="h-9" /><span>%</span></span></label><label className="space-y-1 text-white/55"><span>Deadline</span><span className="flex items-center gap-1"><Input inputMode="numeric" value={deadlineMinutes} onChange={(event) => setDeadlineMinutes(Math.round(boundedNumber(event.target.value, 1, 180, 20)))} className="h-9" /><span>min</span></span></label></div> : null}
    <div className="relative space-y-1">
      <AssetAmountField label="Sell" value={inputValue} asset={sell} assets={sellAssets.assets} balance={sellBalance} balanceOf={sellAssets.balanceOf} balanceLoading={sellAssets.isLoading} readOnly={sell?.form === "venft"} onValue={onSellValue} onAsset={chooseSell} onMax={sell?.form === "venft" ? undefined : setMax} fiat={fiatFor(sell, inputValue)} />
      <div className="relative z-10 -my-3 flex justify-center"><Button type="button" size="icon" variant="secondary" onClick={reverse} disabled={!canReverse} className="h-9 w-9 rounded-xl border-4 border-[#0d1319]" aria-label={canReverse ? "Reverse swap direction" : "Reverse route unavailable"}><ArrowDown className="h-4 w-4" /></Button></div>
      <AssetAmountField label="Buy" value={outputValue} asset={buy} assets={buyAssets.assets} balance={buyBalance} balanceOf={buyAssets.balanceOf} balanceLoading={buyAssets.isLoading} readOnly={sell?.form === "venft"} onValue={onBuyValue} onAsset={chooseBuy} fiat={fiatFor(buy, outputValue)} />
    </div>
    {quote.data && supportedPlan ? <details className="group mt-3 rounded-xl px-2 py-2 text-xs" open><summary className="flex cursor-pointer list-none items-center justify-between text-white/62"><span>{price}</span><ChevronDown className="h-4 w-4 group-open:hidden" /><ChevronUp className="hidden h-4 w-4 group-open:block" /></summary><div className="mt-3 space-y-2 border-t border-white/8 pt-3">
      <DetailRow label="Inverse price" value={inversePrice} /><DetailRow label="Route" value={routeText} /><DetailRow label={supportedPlan.type === "directClSwap" ? "Direct pool route" : "Aurove route"} value={supportedPlan.hops.map((hop) => `Tick spacing ${hop.tickSpacing} · ${(hop.fee / 10_000).toFixed(2)}%`).join(" · ")} />
      {supportedPlan.type === "auroveDepositWrapThenSwap" || supportedPlan.type === "auroveVeNftThenSwap" || supportedPlan.type === "auroveWrapThenSwap" ? <DetailRow label="Before swap" value="Deposits and wraps into ID20 before swapping" /> : null}
      <DetailRow label={tradeType === "exactInput" ? "Minimum received" : "Maximum sold"} value={`${amountText(tradeType === "exactInput" ? supportedPlan.amountOutMinimum : supportedPlan.amountInMaximum, tradeType === "exactInput" ? buy : sell)} ${tradeType === "exactInput" ? buy?.symbol : sell?.symbol}`} />
      <DetailRow label="Price impact" value={quote.data.priceImpactBps === null ? "—" : `${(quote.data.priceImpactBps / 100).toFixed(2)}%`} /><DetailRow label="Slippage tolerance" value={`${(slippageBps / 100).toFixed(2)}%`} /><DetailRow label="Deadline" value={`${deadlineMinutes} minutes`} /><DetailRow label="Router used" value={supportedPlan.routerLabel} /><DetailRow label="Estimated network fee" value={networkFee.data ?? (networkFee.isFetching ? "Estimating…" : "Calculated by wallet at review")} />
    </div></details> : null}
    {quote.data && (quote.data.priceImpactBps ?? 0) >= 500 ? <div className="mx-2 mt-2 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">High price impact. Review this route carefully.</div> : null}
    <div className="mt-3"><WalletConnectButton><Button type="button" className="h-12 w-full" disabled={action.disabled} onClick={handleAction}>{action.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{action.label}</Button></WalletConnectButton></div>
    {execution.state === "confirmed" ? <button type="button" onClick={execution.reset} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100"><Check className="h-4 w-4" /> Swap confirmed</button> : execution.state === "failed" ? <button type="button" onClick={execution.reset} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100"><XCircle className="h-4 w-4" />{execution.error ?? "Swap failed"}</button> : null}
    <Dialog open={["reviewing", "submitting", "pending"].includes(execution.state)} onOpenChange={(open) => { if (!open && execution.state === "reviewing") execution.cancelReview(); }}><DialogContent className="w-[calc(100vw-1.5rem)] max-w-md border-white/12 bg-[#111820]"><DialogHeader><DialogTitle>Review swap</DialogTitle><DialogDescription>Confirm the exact route that will be simulated and submitted.</DialogDescription></DialogHeader>
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><DetailRow label="You sell" value={`${amountText(supportedPlan?.amountIn, sell)} ${sell?.symbol ?? ""}`} /><DetailRow label="You buy" value={`${amountText(supportedPlan?.amountOut, buy)} ${buy?.symbol ?? ""}`} /><DetailRow label="Route" value={routeText} /><DetailRow label="Protection" value={tradeType === "exactInput" ? `Minimum ${amountText(supportedPlan?.amountOutMinimum, buy)} ${buy?.symbol}` : `Maximum ${amountText(supportedPlan?.amountInMaximum, sell)} ${sell?.symbol}`} /></div>
      <DialogFooter><Button variant="secondary" disabled={execution.state !== "reviewing"} onClick={execution.cancelReview}>Cancel</Button><Button disabled={execution.state !== "reviewing"} onClick={() => void execution.submit()}>{execution.state === "submitting" ? "Submitting…" : execution.state === "pending" ? "Swapping…" : "Swap"}{execution.state !== "reviewing" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
