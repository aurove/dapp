"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Search,
  Settings2,
  XCircle,
} from "lucide-react";
import { formatUnits, parseUnits, zeroAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  cn,
} from "@ui";
import { WalletConnectButton } from "@/components/app/wallet-connect-button";
import { hasChainTimestampPassed } from "@/lib/web3/chain-time";
import { useChainDeadline } from "@/lib/web3/use-chain-time";
import { formatCompactDecimal, formatCompactRawTokenAmount } from "@/lib/web3/value-parsers";
import {
  canSwapRoute,
  planSwap,
  useSwapApproval,
  useSwapAssets,
  useSwapExecution,
  useSwapNetworkFee,
  useSwapQuote,
  useSwapRegistry,
  type SingleApprovalRequirement,
  type SwapAsset,
  type SwapExecutionPlan,
  type SwapIntent,
  type SwapQuote,
  type SwapRouteCandidate,
  type SwapTradeType,
} from "@/features/swap";

const swapSchema = Yup.object({
  amount: Yup.string()
    .required("Enter an amount.")
    .matches(/^\d*(?:\.\d*)?$/, "Enter a valid decimal amount.")
    .test("positive", "Amount must be greater than zero.", (value) => Number(value) > 0),
  slippage: Yup.number().typeError("Enter a valid slippage.").min(0.01).max(50).required(),
  deadline: Yup.number().typeError("Enter a valid deadline.").integer().min(1).max(180).required(),
});

function formLabel(asset: SwapAsset): string {
  if (asset.form === "underlying") return "· Underlying ";
  if (asset.form === "venft") return "";
  if (asset.form === "tranche") return "";
  if (asset.form === "id20") return "· Liquid ID20";
  return "· Liquid ERC20";
}

function amountText(value: bigint | undefined, asset: SwapAsset | undefined): string {
  if (value === undefined || !asset) return "";
  return formatCompactRawTokenAmount(value, asset.decimals, null);
}

function amountInputText(value: bigint | undefined, asset: SwapAsset | undefined): string {
  if (value === undefined || !asset) return "";
  return formatUnits(value, asset.decimals);
}

function percentageText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.01) return "<0.01%";
  const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)}%`;
}

function safeParse(value: string, decimals: number): bigint | null {
  if (!value || value === ".") return 0n;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

function normalizeAmount(value: string, decimals: number): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, decimals)}` : whole;
}

function normalizedCaretPosition(value: string, position: number | null, decimals: number): number {
  if (position === null) return normalizeAmount(value, decimals).length;
  return normalizeAmount(value.slice(0, position), decimals).length;
}

function boundedNumber(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function rawFractionAmount(total: bigint, bps: number): bigint {
  return (total * BigInt(bps)) / 10_000n;
}

function fractionText(amount: bigint | null | undefined, total: bigint | undefined): string {
  if (!amount || !total || total <= 0n) return "—";
  if (amount >= total) return "100%";
  const bps = Number((amount * 1_000_000n) / total) / 100;
  return percentageText(bps / 100);
}

function executionPathText(plan: SwapExecutionPlan | undefined): string {
  if (!plan || plan.type === "unsupported") return "—";
  if (plan.type === "auroveVeNftDepositThenTrancheSwap")
    return "Ledger depositVeNft -> Zap Router zapTrancheExactInput";
  if (plan.type === "auroveVeNftThenSwap") return "Zap Router zapVeNftExactInput";
  if (plan.type === "auroveWrapThenSwap") return "Zap Router zapTrancheExactInput";
  if (plan.type === "auroveDepositWrapThenSwap") return "Zap Router zapErc20ExactInput";
  return plan.routerLabel;
}

function quoteForRoute(quote: SwapQuote, route: SwapRouteCandidate): SwapQuote {
  return {
    ...quote,
    routeId: route.id,
    routeLabel: route.label,
    amountIn: route.amountIn,
    amountOut: route.amountOut,
    amountOutMinimum: route.amountOutMinimum,
    amountInMaximum: route.amountInMaximum,
    priceImpactBps: route.priceImpactBps,
    encodedPath: route.encodedPath,
    hops: route.hops,
    legs: route.legs,
  };
}

function routeDeltaText(
  route: SwapRouteCandidate,
  best: SwapRouteCandidate | undefined,
  asset: SwapAsset | undefined,
) {
  if (!best || !asset || route.id === best.id) return "Best";
  const difference =
    route.tradeType === "exactInput"
      ? best.amountOut - route.amountOut
      : route.amountIn - best.amountIn;
  if (difference <= 0n) return "Best";
  return `-${formatCompactRawTokenAmount(difference, asset.decimals, asset.symbol)}`;
}

function routeQualityText(route: SwapRouteCandidate): string {
  const impact =
    route.priceImpactBps === null
      ? "impact unavailable"
      : `${percentageText(route.priceImpactBps / 100)} impact`;
  return `${route.poolCount} pool${route.poolCount === 1 ? "" : "s"} · ${impact}`;
}

function approvalCtaLabel(approval: SingleApprovalRequirement | undefined, sell: SwapAsset) {
  if (approval?.kind === "erc721") return "Approve veNFT deposit";
  if (approval?.kind === "erc1155") return "Approve tranche sale";
  return `Approve ${sell.symbol}`;
}

function TokenMark({ asset }: { asset: SwapAsset }) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] font-bold",
        asset.form === "underlying" || asset.form === "venft"
          ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
          : asset.form === "tranche"
            ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
            : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
      )}
    >
      {asset.symbol.slice(0, 3)}
    </span>
  );
}

function assetGroupLabel(side: "Sell" | "Buy", asset: SwapAsset): string {
  if (side === "Sell") {
    if (asset.form === "venft") return "veNFT positions";
    if (asset.form === "tranche") return "Ledger tranches";
    return "ERC-20 tokens";
  }
  return asset.form === "id20" ? "ID20 tokens" : "Other ERC-20 tokens";
}

function AssetSelector({
  side,
  asset,
  assets,
  balanceOf,
  balancesLoading,
  onSelect,
}: {
  side: "Sell" | "Buy";
  asset?: SwapAsset;
  assets: readonly SwapAsset[];
  balanceOf: (asset: SwapAsset) => bigint;
  balancesLoading?: boolean;
  onSelect: (asset: SwapAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((option) =>
      [
        option.symbol,
        option.name,
        option.address,
        option.trancheId?.toString(),
        option.tokenId?.toString(),
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [assets, search]);
  const groups = useMemo(() => {
    const grouped = new Map<string, SwapAsset[]>();
    filteredAssets.forEach((option) => {
      const label = assetGroupLabel(side, option);
      grouped.set(label, [...(grouped.get(label) ?? []), option]);
    });
    return [...grouped.entries()];
  }, [filteredAssets, side]);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-11 max-w-[48%] shrink-0 rounded-full px-2.5"
        onClick={() => setOpen(true)}
      >
        {asset ? (
          <>
            <TokenMark asset={asset} />
            <span className="truncate font-semibold">{asset.symbol}</span>
          </>
        ) : (
          "Select token"
        )}
        <ChevronDown className="h-4 w-4" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md min-w-0 overflow-hidden border-white/12 bg-[#111820]">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="text-balance">
              Select an asset to {side.toLowerCase()}
            </DialogTitle>
            <DialogDescription className="max-w-full text-pretty break-words whitespace-normal">
              {side === "Buy"
                ? "ID20 representations first, then other ERC-20s available on Mezo CL routes."
                : "Aurove veNFTs and Ledger tranches first, then ERC-20s on Mezo CL routes."}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol, name, ID, or address"
              aria-label="Search assets"
              className="pl-9"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-white/38">
            <span>
              {new Intl.NumberFormat().format(filteredAssets.length)} asset
              {filteredAssets.length === 1 ? "" : "s"}
            </span>
            {search ? (
              <button
                type="button"
                className="text-[#d8b884] hover:text-[#efd39e]"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            ) : null}
          </div>
          <ScrollArea className="max-h-[55vh] min-w-0 pr-3">
            <div className="min-w-0 max-w-full space-y-4">
              {groups.map(([label, options]) => (
                <section key={label} aria-label={label} className="min-w-0">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    {label}
                  </p>
                  <div className="min-w-0 space-y-2">
                    {options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onSelect(option);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "grid w-full min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition",
                          option.id === asset?.id
                            ? "border-[#b58f5f]/60 bg-[#b58f5f]/12"
                            : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]",
                        )}
                      >
                        <TokenMark asset={option} />
                        <span className="min-w-0 overflow-hidden">
                          <span className="block truncate font-semibold text-white">
                            {option.symbol}
                          </span>
                          <span className="block break-words text-xs leading-snug text-white/48 [overflow-wrap:anywhere] line-clamp-2">
                            {(() => {
                              const detail = formLabel(option).replace(/^·\s*/, "").trim();
                              return detail ? `${option.name} · ${detail}` : option.name;
                            })()}
                          </span>
                        </span>
                        <span className="shrink-0 justify-self-end text-right text-xs tabular-nums text-white/55">
                          <span className="block whitespace-nowrap">
                            {balancesLoading
                              ? "…"
                              : formatCompactRawTokenAmount(
                                  balanceOf(option),
                                  option.decimals,
                                  null,
                                )}
                          </span>
                          <span className="text-white/35">Balance</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {!filteredAssets.length ? (
                <p className="p-5 text-center text-sm text-white/50">
                  {search
                    ? "No assets match your search."
                    : "No valid assets for this side of the route."}
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssetAmountField(props: {
  label: string;
  value: string;
  asset?: SwapAsset;
  assets: readonly SwapAsset[];
  balance: bigint;
  balanceOf: (asset: SwapAsset) => bigint;
  balanceLoading?: boolean;
  readOnly?: boolean;
  onValue: (value: string) => void;
  onAsset: (asset: SwapAsset) => void;
  onMax?: () => void;
  fiat?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<{
    start: number;
    end: number;
    direction: "forward" | "backward" | "none";
  } | null>(null);
  const restoreSelection = () => {
    const input = inputRef.current;
    const selection = pendingSelectionRef.current;
    if (!input || !selection) return;
    if (document.activeElement !== input) {
      pendingSelectionRef.current = null;
      return;
    }
    const valueLength = input.value.length;
    input.setSelectionRange(
      Math.min(selection.start, valueLength),
      Math.min(selection.end, valueLength),
      selection.direction,
    );
    pendingSelectionRef.current = null;
  };
  useLayoutEffect(restoreSelection, [props.value]);

  const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart, selectionEnd, selectionDirection } = event.currentTarget;
    const decimals = props.asset?.decimals ?? 18;
    pendingSelectionRef.current = {
      start: normalizedCaretPosition(value, selectionStart, decimals),
      end: normalizedCaretPosition(value, selectionEnd, decimals),
      direction: selectionDirection ?? "none",
    };
    props.onValue(normalizeAmount(value, decimals));
    queueMicrotask(restoreSelection);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 focus-within:border-[#b58f5f]/45">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-white/55">{props.label}</span>
        <span className="text-white/45">
          Balance:{" "}
          {props.balanceLoading
            ? "…"
            : props.asset
              ? formatCompactRawTokenAmount(props.balance, props.asset.decimals, null)
              : "—"}{" "}
          {props.onMax && !props.balanceLoading ? (
            <button
              type="button"
              onClick={props.onMax}
              className="ml-1 font-semibold text-[#d8b884] hover:text-[#efd39e]"
            >
              Max
            </button>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Input
          ref={inputRef}
          name="amount"
          aria-label={`${props.label} amount`}
          inputMode="decimal"
          value={props.value}
          readOnly={props.readOnly}
          placeholder="0"
          onChange={handleValueChange}
          className="h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-3xl font-medium shadow-none focus-visible:ring-0"
        />
        <AssetSelector
          side={props.label as "Sell" | "Buy"}
          asset={props.asset}
          assets={props.assets}
          balanceOf={props.balanceOf}
          balancesLoading={props.balanceLoading}
          onSelect={props.onAsset}
        />
      </div>
      <div className="mt-1 min-h-4 text-xs text-white/38">
        {props.fiat ?? (props.asset ? props.asset.name : "")}
      </div>
    </div>
  );
}

function VeNftSellBreakdown(props: {
  asset: SwapAsset;
  sellAmount: bigint | null;
  sellValue: string;
  outputAmount?: bigint;
  outputAsset?: SwapAsset;
  isQuoting?: boolean;
  path: string;
  onFraction: (bps: number) => void;
}) {
  const total = props.asset.fixedInputAmount ?? 0n;
  const boundedSell =
    props.sellAmount && props.sellAmount > 0n && props.sellAmount <= total
      ? props.sellAmount
      : 0n;
  const remaining = total > boundedSell ? total - boundedSell : 0n;
  const selectedBps = total > 0n ? Number((boundedSell * 10_000n) / total) : 0;
  const expectedOutput = props.outputAsset
    ? props.outputAmount !== undefined
      ? `${amountText(props.outputAmount, props.outputAsset)} ${props.outputAsset.symbol}`
      : props.isQuoting && props.sellValue
        ? "Fetching quote..."
        : "—"
    : "—";
  return (
    <div className="mx-1 mt-2 rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-3 text-xs text-white/60">
      <div className="mb-3 grid grid-cols-4 gap-2" aria-label="veNFT sell fraction">
        {[2500, 5000, 7500, 10000].map((bps) => (
          <Button
            key={bps}
            type="button"
            variant={selectedBps === bps ? "default" : "secondary"}
            className="h-9 rounded-xl px-2 text-xs"
            onClick={() => props.onFraction(bps)}
          >
            {bps / 100}%
          </Button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DetailRow
          label="Total veNFT units"
          value={`${amountText(total, props.asset)} ${props.asset.symbol}`}
        />
        <DetailRow
          label="Selling"
          value={
            boundedSell > 0n
              ? `${amountText(boundedSell, props.asset)} (${fractionText(boundedSell, total)})`
              : "—"
          }
        />
        <DetailRow
          label="Remaining ERC1155"
          value={`${amountText(remaining, props.asset)} ${props.asset.symbol}`}
        />
        <DetailRow label="Expected output" value={expectedOutput} />
      </div>
      <div className="mt-2 border-t border-white/8 pt-2">
        <DetailRow label="Execution path" value={props.path} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/48">{label}</span>
      <span className="text-right font-medium text-white/82">{value}</span>
    </div>
  );
}

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
  const [openDetailsKey, setOpenDetailsKey] = useState<string>();
  const [selectedRoute, setSelectedRoute] = useState<{ key: string; id: string }>();
  const formik = useFormik({
    initialValues: { amount: "", slippage: "0.5", deadline: "20" },
    validationSchema: swapSchema,
    onSubmit: () => handleAction(),
  });
  const deadlineWindowSeconds = BigInt(Math.round(deadlineMinutes * 60));
  const { chainTimestamp, deadline, isChainTimeLoading } = useChainDeadline(deadlineWindowSeconds);

  const resolvedSellId =
    sellId ??
    registry?.assets.find((asset) => asset.id === "erc20:MUSD")?.id ??
    registry?.assets[0]?.id;
  const sell = registry?.assets.find((asset) => asset.id === resolvedSellId);
  const routedDefaultBuy =
    registry && sell
      ? (registry.assets.find(
          (asset) =>
            asset.form === "id20" &&
            canSwapRoute(registry, sell.executableAddress, asset.executableAddress),
        ) ??
        registry.assets.find(
          (asset) =>
            asset.form === "erc20" &&
            asset.id !== sell.id &&
            canSwapRoute(registry, sell.executableAddress, asset.executableAddress),
        ))
      : undefined;
  const resolvedBuyId = buyId ?? routedDefaultBuy?.id;
  const buy = registry?.assets.find((asset) => asset.id === resolvedBuyId);
  const sellAssets = useSwapAssets(registry, buy, "sell");
  const buyAssets = useSwapAssets(registry, sell, "buy");
  const parsedAmount = safeParse(
    typedAmount,
    (tradeType === "exactInput" ? sell : buy)?.decimals ?? 18,
  );
  const intent = useMemo<SwapIntent | undefined>(
    () =>
      sell && buy && deadline !== null && parsedAmount !== null && parsedAmount > 0n
        ? {
            chainId: registry!.chainId,
            account: (account.address ?? zeroAddress) as Address,
            tokenIn: sell,
            tokenOut: buy,
            tradeType,
            amount: parsedAmount,
            slippageBps,
            recipient: (account.address ?? zeroAddress) as Address,
            deadline,
          }
        : undefined,
    [account.address, buy, deadline, parsedAmount, registry, sell, slippageBps, tradeType],
  );
  const quote = useSwapQuote({
    registry,
    tokenIn: sell?.executableAddress,
    tokenOut: buy?.executableAddress,
    tradeType,
    amount: parsedAmount ?? 0n,
    account: account.address,
    slippageBps,
    maxHops: registry?.routing.maxHops,
  });
  const routeSelectionKey =
    sell && buy && parsedAmount !== null && parsedAmount > 0n
      ? `${sell.id}:${buy.id}:${tradeType}:${parsedAmount.toString()}`
      : undefined;
  const routeCandidates = quote.data?.routes ?? [];
  const selectedRouteId =
    selectedRoute && selectedRoute.key === routeSelectionKey ? selectedRoute.id : undefined;
  const selectedRouteCandidate =
    selectedRouteId !== undefined
      ? routeCandidates.find((route) => route.id === selectedRouteId)
      : undefined;
  const activeRouteCandidate = selectedRouteCandidate ?? routeCandidates[0];
  const activeQuote =
    quote.data && activeRouteCandidate ? quoteForRoute(quote.data, activeRouteCandidate) : quote.data;
  const plan = useMemo(
    () => (intent && registry && activeQuote ? planSwap(intent, registry, activeQuote) : undefined),
    [activeQuote, intent, registry],
  );
  const supportedPlan = plan && plan.type !== "unsupported" ? plan : undefined;
  const approval = useSwapApproval(plan);
  const networkFee = useSwapNetworkFee(plan, approval.isApproved);
  const execution = useSwapExecution({ plan, quote: activeQuote, verifyApproval: approval.verify });
  const sellBalance = sell ? sellAssets.balanceOf(sell) : 0n;
  const buyBalance = buy ? buyAssets.balanceOf(buy) : 0n;
  const requiredBalance = activeQuote
    ? tradeType === "exactOutput" && supportedPlan
      ? supportedPlan.amountInMaximum
      : activeQuote.amountIn
    : 0n;
  const insufficient = requiredBalance > sellBalance;
  const outputValue =
    tradeType === "exactInput" ? amountInputText(activeQuote?.amountOut, buy) : typedAmount;
  const inputValue =
    tradeType === "exactOutput" ? amountInputText(activeQuote?.amountIn, sell) : typedAmount;
  const fiatFor = (asset: SwapAsset | undefined, value: string) =>
    asset?.symbol === "MUSD" && value ? `≈ $${formatCompactDecimal(value)}` : undefined;
  const reverseBuyAsset =
    sell?.form === "underlying" || sell?.form === "venft" || sell?.form === "tranche"
      ? registry?.assets.find(
          (asset) =>
            asset.form === "id20" &&
            asset.executableAddress.toLowerCase() === sell.executableAddress.toLowerCase(),
        )
      : sell;
  const canReverse = Boolean(
    registry &&
    buy &&
    reverseBuyAsset &&
    canSwapRoute(registry, buy.executableAddress, reverseBuyAsset.executableAddress),
  );

  const setFormAmount = (value: string) => {
    setTypedAmount(value);
    void formik.setFieldValue("amount", value, false);
  };
  const chooseSell = (asset: SwapAsset) => {
    setSellId(asset.id);
    setTradeType("exactInput");
    setFormAmount("");
  };
  const chooseBuy = (asset: SwapAsset) => {
    setBuyId(asset.id);
  };
  const reverse = () => {
    if (!buy || !reverseBuyAsset || !canReverse) return;
    setSellId(buy.id);
    setBuyId(reverseBuyAsset.id);
    setTradeType("exactInput");
    setFormAmount("");
  };
  const setMax = () => {
    if (!sell) return;
    setTradeType("exactInput");
    setFormAmount(formatUnits(sellBalance, sell.decimals));
  };
  const onSellValue = (value: string) => {
    setTradeType("exactInput");
    setFormAmount(value);
  };
  const setVeNftFraction = (bps: number) => {
    if (!sell?.fixedInputAmount) return;
    setTradeType("exactInput");
    setFormAmount(formatUnits(rawFractionAmount(sell.fixedInputAmount, bps), sell.decimals));
  };
  const onBuyValue = (value: string) => {
    if (sell?.form === "venft") return;
    setTradeType("exactOutput");
    setFormAmount(value);
  };
  const price =
    activeQuote && activeQuote.amountIn > 0n && activeQuote.amountOut > 0n && sell && buy
      ? `${formatCompactRawTokenAmount((activeQuote.amountOut * 10n ** BigInt(sell.decimals)) / activeQuote.amountIn, buy.decimals, null)} ${buy.symbol} per ${sell.symbol}`
      : "—";
  const inversePrice =
    activeQuote && activeQuote.amountOut > 0n && sell && buy
      ? `${formatCompactRawTokenAmount((activeQuote.amountIn * 10n ** BigInt(buy.decimals)) / activeQuote.amountOut, sell.decimals, null)} ${sell.symbol} per ${buy.symbol}`
      : "—";
  const routeSymbol = (token: Address) =>
    registry?.assets.find(
      (asset) =>
        (asset.form === "erc20" || asset.form === "id20") &&
        asset.executableAddress.toLowerCase() === token.toLowerCase(),
    )?.symbol ?? "Pool";
  const swapRouteTextFor = (hops: readonly { tokenIn: Address; tokenOut: Address }[]) =>
    hops.length > 0
      ? [routeSymbol(hops[0].tokenIn), ...hops.map((hop) => routeSymbol(hop.tokenOut))].join(
          " → ",
        )
      : "—";
  const routeTextFor = (hops: readonly { tokenIn: Address; tokenOut: Address }[]) => {
    const swapPath = swapRouteTextFor(hops);
    if (swapPath === "—") return swapPath;
    if (sell?.form === "venft") return `${sell.symbol} → ERC1155 units → ${swapPath}`;
    if (sell?.form === "tranche") return `${sell.symbol} → ERC1155 units → ${swapPath}`;
    if (sell?.form === "underlying") return `${sell.symbol} → ${swapPath}`;
    return swapPath;
  };
  const routeText = supportedPlan ? routeTextFor(supportedPlan.hops) : "—";
  const bestRouteCandidate = routeCandidates[0];
  const routeModeText = selectedRouteCandidate ? "Selected route" : "Best route";
  const detailsKey =
    activeQuote && supportedPlan
      ? `${resolvedSellId}:${resolvedBuyId}:${tradeType}:${typedAmount}`
      : undefined;
  const detailsOpen = detailsKey !== undefined && openDetailsKey === detailsKey;
  const executionPath = executionPathText(supportedPlan);
  const veNftSellAmount = sell?.form === "venft" ? parsedAmount : null;
  const veNftTotalUnits = sell?.form === "venft" ? sell.fixedInputAmount : undefined;
  const veNftRemainingUnits =
    veNftSellAmount !== null &&
    veNftTotalUnits !== undefined &&
    veNftSellAmount > 0n &&
    veNftSellAmount <= veNftTotalUnits
      ? veNftTotalUnits - veNftSellAmount
      : undefined;
  const quoteExpired = Boolean(
    activeQuote && hasChainTimestampPassed(chainTimestamp, activeQuote.expiresAtBlockTimestamp),
  );
  const currentQuote = activeQuote;
  const quoteIsDebouncing = quote.isDebouncing;
  const quoteIsFetching = quote.isFetching;
  const refetchQuote = quote.refetch;
  const lastAutoRefreshedQuoteRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!currentQuote || !quoteExpired || quoteIsDebouncing || quoteIsFetching) return;

    const quoteKey = `${currentQuote.blockNumber}:${currentQuote.expiresAtBlockTimestamp}`;
    if (lastAutoRefreshedQuoteRef.current === quoteKey) return;

    lastAutoRefreshedQuoteRef.current = quoteKey;
    void refetchQuote();
  }, [currentQuote, quoteExpired, quoteIsDebouncing, quoteIsFetching, refetchQuote]);
  const action = (() => {
    if (!registry && registryQuery.isLoading) return { label: "Loading markets…", disabled: true };
    if (!registry)
      return {
        label: registryQuery.isError ? "Unable to load markets" : "Unsupported network",
        disabled: true,
      };
    if (isChainTimeLoading || chainTimestamp === null)
      return { label: "Reading blockchain time…", disabled: true, loading: true };
    if (!sell || !buy) return { label: "Select tokens", disabled: true };
    if (!typedAmount) return { label: "Enter an amount", disabled: true };
    if (parsedAmount === null || parsedAmount <= 0n)
      return { label: "Invalid amount", disabled: true };
    if (quote.isDebouncing) return { label: "Fetching quote…", disabled: true, loading: true };
    if (!activeQuote && (quote.isDebouncing || quote.isPending || quote.isFetching))
      return { label: "Fetching quote…", disabled: true, loading: true };
    if (quote.routeState === "no-route") return { label: "No route available", disabled: true };
    if (quote.routeState === "insufficient-liquidity")
      return { label: "Insufficient liquidity", disabled: true };
    if (quote.routeState === "stale-quote")
      return { label: "Quote stale — refresh", disabled: false, refresh: true };
    if (quote.routeState === "failed-simulation")
      return {
        label:
          quote.routeResult?.status === "failed-simulation"
            ? quote.routeResult.reason
            : "Route simulation failed",
        disabled: true,
      };
    if (quoteExpired) {
      if (quote.isFetching)
        return { label: "Refreshing quote…", disabled: true, loading: true };
      if (quote.isError)
        return { label: "Quote refresh failed — retry", disabled: false, refresh: true };
      return { label: "Quote expired — refreshing…", disabled: true, loading: true };
    }
    if (insufficient) return { label: `Insufficient ${sell.symbol} balance`, disabled: true };
    if (plan?.type === "unsupported") return { label: plan.reason, disabled: true };
    if (quote.isError || !activeQuote || !supportedPlan)
      return { label: "Unable to quote route", disabled: true };
    if (approval.isChecking) return { label: "Checking approval…", disabled: true, loading: true };
    if (!approval.isApproved)
      return {
        label: approval.isApproving
          ? "Approving…"
          : approvalCtaLabel(approval.pendingApproval, sell),
        disabled: approval.isApproving,
        approve: true,
        loading: approval.isApproving,
      };
    return { label: "Review swap", disabled: false };
  })();
  function handleAction() {
    if (action.disabled) return;
    if (action.approve) void approval.approve();
    else if (action.refresh) void quote.refetch();
    else execution.review();
  }
  const formError = formik.errors.amount ?? formik.errors.slippage ?? formik.errors.deadline;

  return (
    <form
      onSubmit={formik.handleSubmit}
      noValidate
      className="mx-auto w-full max-w-[500px] rounded-[28px] border border-white/12 bg-[rgba(13,19,25,0.94)] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-4"
      aria-label="Aurove swap"
    >
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <div>
          <h2 className="text-lg font-semibold text-white">Swap</h2>
          <p className="flex items-center gap-1.5 text-xs text-white/42" aria-live="polite">
            Swap through Mezo CL and AMM
            {registry && registryQuery.isError ? (
              <>
                <span>·</span>
                <span className="text-amber-200/75">Using cached markets</span>
              </>
            ) : registry && registryQuery.isFetching ? (
              <>
                <span>·</span>
                <LoaderCircle className="h-3 w-3 animate-spin" />
                <span>Refreshing markets</span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-label="Swap settings"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
      {settingsOpen ? (
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs">
          <label className="space-y-1 text-white/55">
            <span>Slippage tolerance</span>
            <span className="flex items-center gap-1">
              <Input
                name="slippage"
                inputMode="decimal"
                value={(slippageBps / 100).toString()}
                onBlur={formik.handleBlur}
                onChange={(event) => {
                  const value = event.target.value;
                  void formik.setFieldValue("slippage", value);
                  setSlippageBps(Math.round(boundedNumber(value, 0.01, 50, 0.5) * 100));
                }}
                className="h-9"
              />
              <span>%</span>
            </span>
          </label>
          <label className="space-y-1 text-white/55">
            <span>Deadline</span>
            <span className="flex items-center gap-1">
              <Input
                name="deadline"
                inputMode="numeric"
                value={deadlineMinutes}
                onBlur={formik.handleBlur}
                onChange={(event) => {
                  const value = event.target.value;
                  void formik.setFieldValue("deadline", value);
                  setDeadlineMinutes(Math.round(boundedNumber(value, 1, 180, 20)));
                }}
                className="h-9"
              />
              <span>min</span>
            </span>
          </label>
        </div>
      ) : null}
      <div className="relative space-y-1">
        <AssetAmountField
          label="Sell"
          value={inputValue}
          asset={sell}
          assets={sellAssets.assets}
          balance={sellBalance}
          balanceOf={sellAssets.balanceOf}
          balanceLoading={sellAssets.isLoading}
          onValue={onSellValue}
          onAsset={chooseSell}
          onMax={sell?.form === "venft" ? undefined : setMax}
          fiat={fiatFor(sell, inputValue)}
        />
        {sell?.form === "venft" ? (
          <VeNftSellBreakdown
            asset={sell}
            sellAmount={veNftSellAmount}
            sellValue={typedAmount}
            outputAmount={activeQuote?.amountOut}
            outputAsset={buy}
            isQuoting={quote.isDebouncing || quote.isPending || quote.isFetching}
            path={executionPath}
            onFraction={setVeNftFraction}
          />
        ) : null}
        <div className="relative z-10 -my-3 flex justify-center">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={reverse}
            disabled={!canReverse}
            className="h-9 w-9 rounded-xl border-4 border-[#0d1319]"
            aria-label={canReverse ? "Reverse swap direction" : "Reverse route unavailable"}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
        <AssetAmountField
          label="Buy"
          value={outputValue}
          asset={buy}
          assets={buyAssets.assets}
          balance={buyBalance}
          balanceOf={buyAssets.balanceOf}
          balanceLoading={buyAssets.isLoading}
          readOnly={sell?.form === "venft"}
          onValue={onBuyValue}
          onAsset={chooseBuy}
          fiat={fiatFor(buy, outputValue)}
        />
      </div>
      {activeQuote && supportedPlan ? (
        <div className="mt-3 rounded-xl px-2 py-2 text-xs">
          <div className="flex items-center justify-between gap-3 text-white/62">
            <button
              type="button"
              onClick={() =>
                setOpenDetailsKey((value) => (value === detailsKey ? undefined : detailsKey))
              }
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate font-medium text-white/80">
                {routeModeText} · {routeText}
              </span>
              <span className="mt-0.5 block truncate text-white/42">
                {activeQuote.routeLabel} ·{" "}
                {activeRouteCandidate ? routeQualityText(activeRouteCandidate) : "Route ready"}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                setOpenDetailsKey((value) => (value === detailsKey ? undefined : detailsKey))
              }
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/62 transition hover:bg-white/[0.06] hover:text-white"
              aria-label={detailsOpen ? "Close swap details" : "Open swap details"}
              aria-expanded={detailsOpen}
            >
              {detailsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
          {detailsOpen ? (
            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedRoute(undefined)}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-left transition",
                    !selectedRouteCandidate
                      ? "border-[#b58f5f]/60 bg-[#b58f5f]/12"
                      : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">
                      Auto · {routeTextFor(bestRouteCandidate?.hops ?? [])}
                    </span>
                    <span className="mt-1 block truncate text-white/45">
                      {bestRouteCandidate
                        ? `${bestRouteCandidate.label} · ${routeQualityText(bestRouteCandidate)}`
                        : "Best executable route"}
                    </span>
                  </span>
                  <span className="text-right font-semibold text-emerald-100">Best</span>
                </button>
                {routeCandidates.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() =>
                      routeSelectionKey
                        ? setSelectedRoute({ key: routeSelectionKey, id: route.id })
                        : undefined
                    }
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-left transition",
                      selectedRouteCandidate?.id === route.id
                        ? "border-[#b58f5f]/60 bg-[#b58f5f]/12"
                        : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">
                        {route.label} · {routeTextFor(route.hops)}
                      </span>
                      <span className="mt-1 block truncate text-white/45">
                        {routeQualityText(route)} · {route.hopCount} hop
                        {route.hopCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold text-white">
                        {amountText(
                          tradeType === "exactInput" ? route.amountOut : route.amountIn,
                          tradeType === "exactInput" ? buy : sell,
                        )}
                      </span>
                      <span className="text-white/42">
                        {routeDeltaText(
                          route,
                          bestRouteCandidate,
                          tradeType === "exactInput" ? buy : sell,
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
                {sell?.form === "venft" || sell?.form === "tranche" ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <span className="truncate font-medium text-white/82">{sell.symbol}</span>
                    <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/48">
                      Deposit
                    </span>
                    <span className="truncate text-right font-medium text-white/82">
                      ERC1155 units
                    </span>
                  </div>
                ) : sell?.form === "underlying" ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                    <span className="truncate font-medium text-white/82">{sell.symbol}</span>
                    <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/48">
                      Aurove
                    </span>
                    <span className="truncate text-right font-medium text-white/82">
                      {activeQuote.legs[0]?.tokenIn
                        ? routeSymbol(activeQuote.legs[0].tokenIn)
                        : "ID20"}
                    </span>
                  </div>
                ) : null}
                {activeQuote.legs.map((leg, index) => (
                  <div
                    key={`${leg.type}:${leg.pool ?? index}:${leg.tokenIn ?? ""}:${leg.tokenOut ?? ""}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"
                  >
                    <span className="truncate font-medium text-white/82">
                      {leg.tokenIn ? routeSymbol(leg.tokenIn) : index === 0 ? sell?.symbol : "Asset"}
                    </span>
                    <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/48">
                      {leg.label}
                    </span>
                    <span className="truncate text-right font-medium text-white/82">
                      {leg.tokenOut ? routeSymbol(leg.tokenOut) : buy?.symbol}
                    </span>
                  </div>
                ))}
              </div>
              <DetailRow label="Price" value={price} />
              <DetailRow label="Inverse price" value={inversePrice} />
              <DetailRow label="Route" value={routeText} />
              <DetailRow
                label={supportedPlan.routerLabel}
                value={supportedPlan.hops
                  .map((hop) =>
                    hop.venue === "basic"
                      ? `${hop.stable ? "Stable" : "Volatile"} AMM`
                      : `Tick spacing ${hop.tickSpacing} · ${percentageText(hop.fee / 10_000)}`,
                  )
                  .join(" · ")}
              />
              <DetailRow label="Execution path" value={executionPath} />
              {supportedPlan.type === "auroveVeNftDepositThenTrancheSwap" ? (
                <DetailRow
                  label="Before swap"
                  value="Deposits veNFT to Ledger, then sells selected ERC1155 units"
                />
              ) : supportedPlan.type === "auroveDepositWrapThenSwap" ||
                supportedPlan.type === "auroveVeNftThenSwap" ||
                supportedPlan.type === "auroveWrapThenSwap" ? (
                <DetailRow
                  label="Before swap"
                  value="Deposits and wraps into ID20 before swapping"
                />
              ) : null}
              {sell?.form === "venft" ? (
                <>
                  <DetailRow
                    label="Total veNFT units"
                    value={`${amountText(veNftTotalUnits, sell)} ${sell.symbol}`}
                  />
                  <DetailRow
                    label="veNFT units sold"
                    value={`${amountText(veNftSellAmount ?? undefined, sell)} ${sell.symbol} (${fractionText(veNftSellAmount, veNftTotalUnits)})`}
                  />
                  <DetailRow
                    label="ERC1155 units remaining"
                    value={`${amountText(veNftRemainingUnits, sell)} ${sell.symbol}`}
                  />
                </>
              ) : null}
              <DetailRow
                label={tradeType === "exactInput" ? "Minimum received" : "Maximum sold"}
                value={`${amountText(tradeType === "exactInput" ? supportedPlan.amountOutMinimum : supportedPlan.amountInMaximum, tradeType === "exactInput" ? buy : sell)} ${tradeType === "exactInput" ? buy?.symbol : sell?.symbol}`}
              />
              <DetailRow
                label="Price impact"
                value={percentageText(
                  activeQuote.priceImpactBps === null ? null : activeQuote.priceImpactBps / 100,
                )}
              />
              <DetailRow label="Slippage tolerance" value={percentageText(slippageBps / 100)} />
              <DetailRow
                label="Deadline"
                value={`${new Intl.NumberFormat().format(deadlineMinutes)} minutes`}
              />
              <DetailRow label="Router used" value={supportedPlan.routerLabel} />
              <DetailRow
                label="Estimated network fee"
                value={
                  networkFee.data ??
                  (networkFee.isFetching ? "Estimating…" : "Calculated by wallet at review")
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {activeQuote && (activeQuote.priceImpactBps ?? 0) >= 500 ? (
        <div className="mx-2 mt-2 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
          High price impact. Review this route carefully.
        </div>
      ) : null}
      {formik.submitCount > 0 && formError ? (
        <p role="alert" className="mx-2 mt-2 text-xs text-red-200">
          {formError}
        </p>
      ) : null}
      <div className="mt-3">
        <WalletConnectButton>
          <Button type="submit" className="h-12 w-full" disabled={action.disabled}>
            {action.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {action.label}
          </Button>
        </WalletConnectButton>
      </div>
      {execution.state === "confirmed" ? (
        <button
          type="button"
          onClick={execution.reset}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100"
        >
          <Check className="h-4 w-4" /> Swap confirmed
        </button>
      ) : execution.state === "failed" || execution.state === "failed-simulation" ? (
        <button
          type="button"
          onClick={execution.reset}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100"
        >
          <XCircle className="h-4 w-4" />
          {execution.state === "failed-simulation" ? "Simulation failed: " : ""}
          {execution.error ?? "Swap failed"}
        </button>
      ) : null}
      <Dialog
        open={["reviewing", "unlocking", "depositing", "submitting", "pending"].includes(
          execution.state,
        )}
        onOpenChange={(open) => {
          if (!open && execution.state === "reviewing") execution.cancelReview();
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md border-white/12 bg-[#111820]">
          <DialogHeader>
            <DialogTitle>Review swap</DialogTitle>
            <DialogDescription>
              Confirm the exact route that will be simulated and submitted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <DetailRow
              label="You sell"
              value={`${amountText(supportedPlan?.amountIn, sell)} ${sell?.symbol ?? ""}`}
            />
            <DetailRow
              label="You buy"
              value={`${amountText(supportedPlan?.amountOut, buy)} ${buy?.symbol ?? ""}`}
            />
            <DetailRow label="Route" value={routeText} />
            <DetailRow label="Execution path" value={executionPath} />
            {sell?.form === "venft" ? (
              <>
                <DetailRow
                  label="Total veNFT units"
                  value={`${amountText(veNftTotalUnits, sell)} ${sell.symbol}`}
                />
                <DetailRow
                  label="ERC1155 remaining"
                  value={`${amountText(veNftRemainingUnits, sell)} ${sell.symbol}`}
                />
              </>
            ) : null}
            {(supportedPlan?.type === "auroveVeNftThenSwap" ||
              supportedPlan?.type === "auroveVeNftDepositThenTrancheSwap") &&
            supportedPlan.veNft.isPermanent ? (
              <DetailRow label="Preparation" value="Unlock permanent veNFT before swap" />
            ) : null}
            {supportedPlan?.type === "auroveVeNftDepositThenTrancheSwap" ? (
              <DetailRow label="Preparation" value="Deposit veNFT before tranche sale" />
            ) : null}
            <DetailRow
              label="Protection"
              value={
                tradeType === "exactInput"
                  ? `Minimum ${amountText(supportedPlan?.amountOutMinimum, buy)} ${buy?.symbol}`
                  : `Maximum ${amountText(supportedPlan?.amountInMaximum, sell)} ${sell?.symbol}`
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={execution.state !== "reviewing"}
              onClick={execution.cancelReview}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={execution.state !== "reviewing"}
              onClick={() => void execution.submit()}
            >
              {execution.state === "unlocking"
                ? "Unlocking…"
                : execution.state === "depositing"
                  ? "Depositing…"
                : execution.state === "submitting"
                  ? "Submitting…"
                  : execution.state === "pending"
                    ? "Swapping…"
                  : "Swap"}
              {execution.state !== "reviewing" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
