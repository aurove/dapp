"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { erc1155Abi, erc20Abi, erc721Abi, formatUnits, isAddress, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { useAurovePortfolio } from "@/lib/web3/use-aurove-portfolio";
import { useChainTime } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount, parseAmountRaw, readResult } from "@/lib/web3/value-parsers";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { LiquidityRangeGraph } from "./liquidity-range-graph";
import { useSlipstreamPoolState } from "./liquidity-range-graph";
import {
  buildSlipstreamLiquidityQuote,
  type SlipstreamLiquidityQuote,
  type SlipstreamLiquiditySide,
  type SlipstreamLiquiditySource,
  type SlipstreamLiquidityPlan,
  type SlipstreamRouterErc20DepositInput,
  type SlipstreamRouterTrancheWrapInput,
  type SlipstreamRouterVeNftDepositInput,
  type SlipstreamRouterSideInput,
  type SlipstreamSourceFamily,
  sourceDefaultVariantAndEpochs,
  sourceFamilyForToken,
} from "./slipstream-liquidity-quote";
import {
  buildPresetRange,
  formatPriceLabel,
  resolveSlipstreamPoolContractName,
  type SlipstreamPoolState,
  type SlipstreamRangePreset,
} from "./slipstream-adapter";

type LiquidityPoolKey = "BTC" | "MEZO";
type SelectedSourcesState = Record<SlipstreamLiquiditySide, string | null>;
type DraftAmountsState = Record<SlipstreamLiquiditySide, string>;
type PoolFormState = {
  rangeStrategy: SlipstreamRangePreset;
  selectedRange: { tickLower: number; tickUpper: number } | null;
  activeSide: SlipstreamLiquiditySide;
  draftAmounts: DraftAmountsState;
  selectedSourceIds: SelectedSourcesState;
};

type LiquidityPoolOption = {
  key: LiquidityPoolKey;
  label: string;
  available: boolean;
};

type SideLabel = {
  side: SlipstreamLiquiditySide;
  title: string;
};

type SlipstreamLiquidityRouterFunctionName =
  | "addLiquidityErc20Erc20"
  | "addLiquidityErc20Tranche"
  | "addLiquidityErc20VeNft"
  | "addLiquidityTrancheErc20"
  | "addLiquidityTrancheTranche"
  | "addLiquidityTrancheVeNft"
  | "addLiquidityVeNftErc20"
  | "addLiquidityVeNftTranche"
  | "addLiquidityVeNftVeNft";

type SlipstreamLiquidityRouterParams = SlipstreamLiquidityPlan["params"];

type SlipstreamLiquidityRouterCall =
  | {
      functionName: "addLiquidityErc20Erc20";
      args: [SlipstreamRouterErc20DepositInput, SlipstreamRouterErc20DepositInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityErc20Tranche";
      args: [SlipstreamRouterErc20DepositInput, SlipstreamRouterTrancheWrapInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityErc20VeNft";
      args: [SlipstreamRouterErc20DepositInput, SlipstreamRouterVeNftDepositInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityTrancheErc20";
      args: [SlipstreamRouterTrancheWrapInput, SlipstreamRouterErc20DepositInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityTrancheTranche";
      args: [SlipstreamRouterTrancheWrapInput, SlipstreamRouterTrancheWrapInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityTrancheVeNft";
      args: [SlipstreamRouterTrancheWrapInput, SlipstreamRouterVeNftDepositInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityVeNftErc20";
      args: [SlipstreamRouterVeNftDepositInput, SlipstreamRouterErc20DepositInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityVeNftTranche";
      args: [SlipstreamRouterVeNftDepositInput, SlipstreamRouterTrancheWrapInput, SlipstreamLiquidityRouterParams];
    }
  | {
      functionName: "addLiquidityVeNftVeNft";
      args: [SlipstreamRouterVeNftDepositInput, SlipstreamRouterVeNftDepositInput, SlipstreamLiquidityRouterParams];
    };

const DEFAULT_SLIPPAGE_BPS = 50n;
const DEFAULT_DEADLINE_WINDOW_SECONDS = 30n * 60n;

function createInitialPoolFormState(): Record<LiquidityPoolKey, PoolFormState> {
  return {
    BTC: {
      rangeStrategy: "balanced",
      selectedRange: null,
      activeSide: "assetA",
      draftAmounts: { assetA: "", assetB: "" },
      selectedSourceIds: { assetA: null, assetB: null },
    },
    MEZO: {
      rangeStrategy: "balanced",
      selectedRange: null,
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

function sourceButtonTone(selected: boolean, disabled: boolean) {
  return cn(
    "min-h-24 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1117]",
    selected
      ? "border-[var(--accent)]/60 bg-[linear-gradient(180deg,rgba(196,160,106,0.14),rgba(196,160,106,0.06))] text-white"
      : "border-white/10 bg-white/[0.025] text-white/74 hover:border-white/20 hover:bg-white/[0.05]",
    disabled && "cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-white/[0.025]",
  );
}

function TokenMarkStack({ symbol }: { symbol: LiquidityPoolKey }) {
  const tokenImage = symbol === "BTC" ? "/tokens/BTC.png" : "/tokens/MEZO.png";

  return (
    <div className="relative h-12 w-12 shrink-0 sm:h-14 sm:w-14">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--accent)]/35 bg-[rgba(196,160,106,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-14 sm:w-14">
        <Image src={tokenImage} alt="" width={56} height={56} className="h-full w-full object-contain" />
      </div>
      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#0c1117] shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7">
        <Image
          src="/tokens/Aurove.png"
          alt=""
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

function sourceKindLabel(source: SlipstreamLiquiditySource) {
  if (source.kind === "erc20") return source.mode === "wrapped" ? "ID20 WRAPPED" : "ERC-20";
  if (source.kind === "venft") return "veNFT";
  return "Tranche";
}

function sourceFamilyLabel(family: SlipstreamSourceFamily) {
  if (family === "BTC") return "BTC";
  if (family === "MEZO") return "MEZO";
  if (family === "MUSD") return "MUSD";
  return "Unknown";
}

function sourceBalanceLabel(source: SlipstreamLiquiditySource) {
  return formatCompactRawTokenAmount(source.balanceRaw, source.decimals, null);
}

function currentRangeLabel(pool: SlipstreamPoolState, range: { tickLower: number; tickUpper: number } | null) {
  if (!range) return "Unavailable";
  const lower = formatPriceLabel({ pool, tick: range.tickLower });
  const upper = formatPriceLabel({ pool, tick: range.tickUpper });
  return `${lower} to ${upper}`;
}

function resolveSelectedSource(
  sources: SlipstreamLiquiditySource[],
  selectedId: string | null,
): SlipstreamLiquiditySource | null {
  if (selectedId) {
    const selected = sources.find((source) => source.id === selectedId);
    if (selected) return selected;
  }

  return sources.find((source) => source.balanceRaw > 0n) ?? sources[0] ?? null;
}

function buildSourceOptions(params: {
  pool: SlipstreamPoolState;
  portfolio: ReturnType<typeof useAurovePortfolio>["portfolio"];
  token0BalanceRaw: bigint;
  token1BalanceRaw: bigint;
}) {
  const { pool, portfolio, token0BalanceRaw, token1BalanceRaw } = params;
  const token0Family = sourceFamilyForToken(pool.token0?.symbol);
  const token1Family = sourceFamilyForToken(pool.token1?.symbol);

  const buildSideSources = (
    side: SlipstreamLiquiditySide,
    family: SlipstreamSourceFamily,
    tokenAddress: Address | null,
    tokenSymbol: string | null,
    tokenDecimals: number,
    tokenBalanceRaw: bigint,
  ) => {
    const options: SlipstreamLiquiditySource[] = [];
    const managedDepositDefaults = sourceDefaultVariantAndEpochs(family);
    const portfolioToken =
      family === "BTC"
        ? portfolio.tokens.BTC
        : family === "MEZO"
          ? portfolio.tokens.MEZO
          : null;

    if (tokenAddress) {
      options.push({
        id: `${side}:erc20:plain:${tokenAddress.toLowerCase()}`,
        kind: "erc20",
        mode: "plain",
        family,
        label:
          family === "BTC" || family === "MEZO"
            ? `Plain ${sourceFamilyLabel(family)} ERC20`
            : `${tokenSymbol ?? sourceFamilyLabel(family)} wallet`,
        token: tokenAddress,
        balanceRaw: tokenBalanceRaw,
        allowanceRaw: portfolioToken?.allowanceRaw ?? 0n,
        decimals: tokenDecimals,
        variant: 0,
        epochs: 0n,
      });

      if (family === "BTC" || family === "MEZO") {
        options.push({
          id: `${side}:erc20:wrapped:${tokenAddress.toLowerCase()}`,
          kind: "erc20",
          mode: "wrapped",
          family,
          label: `Wrapped ${sourceFamilyLabel(family)} ERC20`,
          token: tokenAddress,
          balanceRaw: tokenBalanceRaw,
          allowanceRaw: portfolioToken?.allowanceRaw ?? 0n,
          decimals: tokenDecimals,
          variant: managedDepositDefaults.variant,
          epochs: managedDepositDefaults.epochs,
        });
      }
    }

    if (family === "BTC" || family === "MEZO") {
      const collectionKey = family === "BTC" ? "veBTC" : "veMEZO";
      const collection = portfolio.veCollections[collectionKey];

      const collectionAddress = collection.address;
      if (collectionAddress) {
        collection.positions.forEach((position) => {
          options.push({
            id: `${side}:venft:${position.tokenId.toString()}`,
            kind: "venft",
            family,
            label: `${collectionKey} #${position.tokenId.toString()}`,
            contractAddress: collectionAddress,
            tokenId: position.tokenId,
            balanceRaw: position.availableFractionCapacityRaw,
            availableFractionCapacityRaw: position.availableFractionCapacityRaw,
            decimals: 18,
            variant: managedDepositDefaults.variant,
            epochs: managedDepositDefaults.epochs,
          });
        });
      }

      const wrapperKey = family === "BTC" ? "avBTCm" : "avMEZOm";
      const wrapper = portfolio.wrappers[wrapperKey];
      if (wrapper.id20Address && wrapper.trancheId !== null) {
        options.push({
          id: `${side}:tranche:${wrapper.trancheId.toString()}`,
          kind: "tranche",
          family,
          label: `${wrapperKey} tranche #${wrapper.trancheId.toString()}`,
          contractAddress: wrapper.id20Address,
          trancheId: wrapper.trancheId,
          balanceRaw: wrapper.erc1155BalanceRaw,
          decimals: 18,
          variant: managedDepositDefaults.variant,
          epochs: managedDepositDefaults.epochs,
        });
      }
    }

    return options;
  };

  const assetASources = buildSideSources(
    "assetA",
    token0Family,
    pool.token0?.address ?? null,
    pool.token0?.symbol ?? null,
    pool.token0?.decimals ?? 18,
    token0BalanceRaw,
  );

  const assetBSources = buildSideSources(
    "assetB",
    token1Family,
    pool.token1?.address ?? null,
    pool.token1?.symbol ?? null,
    pool.token1?.decimals ?? 18,
    token1BalanceRaw,
  );

  return {
    assetA: assetASources,
    assetB: assetBSources,
  };
}

function sourceOptionSummary(source: SlipstreamLiquiditySource) {
  if (source.kind === "erc20") {
    return `${sourceBalanceLabel(source)} available`;
  }

  if (source.kind === "venft") {
    return `${sourceBalanceLabel(source)} capacity`;
  }

  return `${sourceBalanceLabel(source)} tranche balance`;
}

function sourceApprovalLabel(source: SlipstreamLiquiditySource) {
  if (source.kind === "erc20") {
    return source.label;
  }

  return source.kind === "venft" ? `${source.label} veNFT` : `${source.label} tranche units`;
}

function resolveLiquidityRouterFunctionName(
  inputA: SlipstreamLiquiditySource["kind"],
  inputB: SlipstreamLiquiditySource["kind"],
): SlipstreamLiquidityRouterFunctionName {
  switch (`${inputA}:${inputB}`) {
    case "erc20:erc20":
      return "addLiquidityErc20Erc20";
    case "erc20:tranche":
      return "addLiquidityErc20Tranche";
    case "erc20:venft":
      return "addLiquidityErc20VeNft";
    case "tranche:erc20":
      return "addLiquidityTrancheErc20";
    case "tranche:tranche":
      return "addLiquidityTrancheTranche";
    case "tranche:venft":
      return "addLiquidityTrancheVeNft";
    case "venft:erc20":
      return "addLiquidityVeNftErc20";
    case "venft:tranche":
      return "addLiquidityVeNftTranche";
    case "venft:venft":
      return "addLiquidityVeNftVeNft";
    default:
      throw new Error(`Unsupported router input combination: ${inputA}-${inputB}`);
  }
}

function buildLiquidityRouterCall(plan: SlipstreamLiquidityPlan): SlipstreamLiquidityRouterCall {
  const functionName = resolveLiquidityRouterFunctionName(plan.inputA.kind, plan.inputB.kind);

  switch (functionName) {
    case "addLiquidityErc20Erc20":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterErc20DepositInput, plan.inputB.input as SlipstreamRouterErc20DepositInput, plan.params],
      };
    case "addLiquidityErc20Tranche":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterErc20DepositInput, plan.inputB.input as SlipstreamRouterTrancheWrapInput, plan.params],
      };
    case "addLiquidityErc20VeNft":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterErc20DepositInput, plan.inputB.input as SlipstreamRouterVeNftDepositInput, plan.params],
      };
    case "addLiquidityTrancheErc20":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterTrancheWrapInput, plan.inputB.input as SlipstreamRouterErc20DepositInput, plan.params],
      };
    case "addLiquidityTrancheTranche":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterTrancheWrapInput, plan.inputB.input as SlipstreamRouterTrancheWrapInput, plan.params],
      };
    case "addLiquidityTrancheVeNft":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterTrancheWrapInput, plan.inputB.input as SlipstreamRouterVeNftDepositInput, plan.params],
      };
    case "addLiquidityVeNftErc20":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterVeNftDepositInput, plan.inputB.input as SlipstreamRouterErc20DepositInput, plan.params],
      };
    case "addLiquidityVeNftTranche":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterVeNftDepositInput, plan.inputB.input as SlipstreamRouterTrancheWrapInput, plan.params],
      };
    case "addLiquidityVeNftVeNft":
      return {
        functionName,
        args: [plan.inputA.input as SlipstreamRouterVeNftDepositInput, plan.inputB.input as SlipstreamRouterVeNftDepositInput, plan.params],
      };
  }
}

function quoteSummaryValue(value: bigint | null, decimals = 18) {
  if (value === null) return "Unavailable";
  return formatCompactRawTokenAmount(value, decimals, null);
}

function QuoteStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/48">{detail}</p>
    </div>
  );
}

function SideSourceButton({
  source,
  selected,
  disabled,
  onSelect,
}: {
  source: SlipstreamLiquiditySource;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={sourceButtonTone(selected, disabled)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{source.label}</p>
          <p className="mt-0.5 text-xs text-white/45">{sourceOptionSummary(source)}</p>
        </div>
        <Badge className="border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-[0.14em] text-white/72">
          {sourceKindLabel(source)}
        </Badge>
      </div>
      <p className="mt-3 text-xs text-white/45">
        {source.family === "UNKNOWN" ? "Unknown family" : sourceFamilyLabel(source.family)}
        {source.kind === "erc20" ? ` · ${source.decimals} decimals` : ""}
      </p>
    </button>
  );
}

function SidePanel({
  side,
  pool,
  source,
  selectedSource,
  sources,
  inputValue,
  quotedValue,
  balanceRaw,
  onFocus,
  onChange,
  onMax,
  onSelectSource,
  isActive,
}: {
  side: SlipstreamLiquiditySide;
  pool: SlipstreamPoolState;
  source: SideLabel;
  selectedSource: SlipstreamLiquiditySource | null;
  sources: SlipstreamLiquiditySource[];
  inputValue: string;
  quotedValue: string;
  balanceRaw: bigint | null;
  onFocus: () => void;
  onChange: (value: string) => void;
  onMax: () => void;
  onSelectSource: (sourceId: string) => void;
  isActive: boolean;
}) {
  const token = side === "assetA" ? pool.token0 : pool.token1;
  const balanceLabel = balanceRaw === null ? "Balance unavailable" : formatCompactRawTokenAmount(balanceRaw, token?.decimals ?? 18, token?.symbol ?? null);
  const displayValue = isActive ? inputValue : quotedValue;
  const canMax = Boolean(selectedSource && selectedSource.balanceRaw > 0n);
  const activeSourceCount = sources.filter((item) => item.balanceRaw > 0n).length;

  return (
    <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">{source.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-white">{token?.symbol ?? source.title}</p>
            <Badge className="border-white/10 bg-white/[0.04] text-white/72">
              {token?.symbol ?? "Token"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-white/52">
            Balance: {balanceLabel}
          </p>
        </div>
        <Badge className={cn("normal-case tracking-normal", isActive ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-white/10 bg-white/[0.03] text-white/68")}>
          {isActive ? "Editing" : "Quoted"}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`liquidity-${side}`} className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
            Amount
          </label>
        </div>

        <div className="flex gap-2">
          <Input
            id={`liquidity-${side}`}
            inputMode="decimal"
            placeholder="0.0"
            value={displayValue}
            onFocus={onFocus}
            onChange={(event) => onChange(normalizeAmountInput(event.target.value))}
            readOnly={!isActive}
            disabled={!selectedSource}
            className="h-14 border-white/12 bg-white/[0.02] px-4 text-2xl font-semibold text-white shadow-none focus-visible:ring-offset-0 read-only:cursor-pointer"
          />
          <Button type="button" variant="outline" size="lg" onClick={onMax} disabled={!canMax}>
            Max
          </Button>
        </div>
        <p className="text-xs text-white/45">
          {activeSourceCount > 0 ? `Choose from ${activeSourceCount} available source${activeSourceCount === 1 ? "" : "s"}.` : "No usable source is available for this side."}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">Source</p>
          <p className="text-xs text-white/45">{selectedSource ? sourceKindLabel(selectedSource) : "Unavailable"}</p>
        </div>

        {sources.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((item) => (
              <SideSourceButton
                key={item.id}
                source={item}
                selected={selectedSource?.id === item.id}
                disabled={item.balanceRaw <= 0n}
                onSelect={() => onSelectSource(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-white/48">
            No compatible sources were found for this side.
          </div>
        )}
      </div>
    </div>
  );
}

export function AddLiquidityCard() {
  const chainId = useChainId();
  const { address: account } = useAccount();
  const { chainTimestamp } = useChainTime();
  const portfolio = useAurovePortfolio({ ownerAddress: account ?? undefined, chainId, enabled: Boolean(account) });
  const [selectedPoolState, setSelectedPoolState] = useState<LiquidityPoolKey>("BTC");
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
  const routerAddress = getContractConfig(chainId, "AuroveZapRouter")?.address ?? null;
  const token0BalanceRead = useReadContracts({
    allowFailure: true,
    contracts:
      account && pool.token0?.address
        ? [
            {
              address: pool.token0.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            },
          ]
        : [],
    query: {
      enabled: Boolean(account && pool.token0?.address),
    },
  });

  const token1BalanceRead = useReadContracts({
    allowFailure: true,
    contracts:
      account && pool.token1?.address
        ? [
            {
              address: pool.token1.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            },
          ]
        : [],
    query: {
      enabled: Boolean(account && pool.token1?.address),
    },
  });

  const token0BalanceRaw = readResult<bigint>(token0BalanceRead.data, 0) ?? 0n;
  const token1BalanceRaw = readResult<bigint>(token1BalanceRead.data, 0) ?? 0n;
  const formState = poolFormStateByKey[selectedPool];

  const currentRange = useMemo(() => {
    if (!pool.tickSpacing || pool.currentTick === null) return null;
    return formState.selectedRange ?? buildPresetRange("balanced", pool.currentTick, pool.tickSpacing);
  }, [formState.selectedRange, pool.currentTick, pool.tickSpacing]);

  const sourcesBySide = useMemo(
    () =>
      buildSourceOptions({
        pool,
        portfolio: portfolio.portfolio,
        token0BalanceRaw,
        token1BalanceRaw,
      }),
    [portfolio.portfolio, pool, token0BalanceRaw, token1BalanceRaw],
  );

  const selectedSourceA = useMemo(
    () => resolveSelectedSource(sourcesBySide.assetA, formState.selectedSourceIds.assetA),
    [formState.selectedSourceIds.assetA, sourcesBySide.assetA],
  );
  const selectedSourceB = useMemo(
    () => resolveSelectedSource(sourcesBySide.assetB, formState.selectedSourceIds.assetB),
    [formState.selectedSourceIds.assetB, sourcesBySide.assetB],
  );

  const deadline = chainTimestamp !== null ? chainTimestamp + DEFAULT_DEADLINE_WINDOW_SECONDS : null;

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
    const steps: TxStep[] = [];

    if (!isAddress(routerAddress)) {
      throw new Error("Liquidity router is not configured on this network.");
    }

    const addApprovalStep = (
      source: SlipstreamLiquiditySource | null,
      input: SlipstreamRouterSideInput,
      suffix: string,
    ) => {
      if (!source) {
        throw new Error("A liquidity source is missing.");
      }

      const stepLabel = `Approve ${sourceApprovalLabel(source)}`;

      if (source.kind === "erc20") {
        if (!isAddress(source.token)) {
          throw new Error(`Invalid ERC20 source for ${source.label}.`);
        }

        const amount =
          input.kind === "erc20"
            ? input.input.deposit.value
            : input.kind === "tranche"
              ? input.input.amount
              : 0n;

        steps.push(
          makeAddressWriteStep({
            key: `liquidity-approve-${suffix}`,
            label: stepLabel,
            displayLabelBtn: true,
            address: source.token,
            abi: erc20Abi,
            variables: {
              functionName: "approve",
              args: [routerAddress, amount],
            },
          }) as unknown as TxStep,
        );
        return;
      }

      if (!isAddress(source.contractAddress)) {
        throw new Error(`Invalid source contract for ${source.label}.`);
      }

      steps.push(
        makeAddressWriteStep({
          key: `liquidity-approve-${suffix}`,
          label: stepLabel,
          displayLabelBtn: true,
          address: source.contractAddress,
          abi: source.kind === "venft" ? erc721Abi : erc1155Abi,
          variables: {
            functionName: "setApprovalForAll",
            args: [routerAddress, true],
          },
        }) as unknown as TxStep,
      );
    };

    addApprovalStep(selectedSourceA, plan.inputA, "assetA");
    addApprovalStep(selectedSourceB, plan.inputB, "assetB");

    const routerCall = buildLiquidityRouterCall(plan);

    steps.push(
      makeContractWriteStep({
        key: "liquidity-add",
        label: "Supply liquidity",
        displayLabelBtn: true,
        contractName: "AuroveZapRouter",
        variables: routerCall,
      }) as unknown as TxStep,
    );

    return steps;
  }, [quote.routerPlan, routerAddress, selectedSourceA, selectedSourceB]);

  const currentTick = pool.currentTick;
  const currentPriceText =
    currentTick === null ? "Unavailable" : formatPriceLabel({ pool, tick: currentTick });
  const rangeLabel = currentRangeLabel(pool, currentRange);
  const rangeStartsInRange = quote.beginsInRange;
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
      setPoolFormStateByKey((current) => {
        const nextState = current[selectedPool];
        const currentRange = nextState.selectedRange;

        const hasSameRange =
          currentRange === selection.range ||
          (currentRange !== null &&
            selection.range !== null &&
            currentRange.tickLower === selection.range.tickLower &&
            currentRange.tickUpper === selection.range.tickUpper);

        if (hasSameRange && nextState.rangeStrategy === selection.strategy) {
          return current;
        }

        return {
          ...current,
          [selectedPool]: {
            ...nextState,
            selectedRange: selection.range,
            rangeStrategy: selection.strategy,
          },
        };
      });
    },
    [selectedPool],
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

          <button
            type="button"
            title="Choose the pool you want to add liquidity to."
            aria-label="Choose the pool you want to add liquidity to."
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/55 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06] hover:text-white"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
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

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-1.5">
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
              onSelectionChange={handleGraphSelection}
            />
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
              No pool is currently available on this network.
            </div>
          )}
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

          <div className="grid gap-4 lg:grid-cols-2">
            <SidePanel
              side="assetA"
              pool={pool}
              source={{ side: "assetA", title: pool.token0?.symbol ?? "Asset A" }}
              selectedSource={selectedSourceA}
              sources={sourcesBySide.assetA}
              inputValue={formState.draftAmounts.assetA}
              quotedValue={sideDisplayValue("assetA")}
              balanceRaw={selectedSourceA?.balanceRaw ?? null}
              onFocus={() => activateSide("assetA", sideDisplayValue("assetA"))}
              onChange={(value) => handleAmountChange("assetA", value)}
              onMax={() => setMaxForSide("assetA")}
              onSelectSource={(sourceId) =>
                setPoolFormStateByKey((current) => ({
                  ...current,
                  [selectedPool]: {
                    ...current[selectedPool],
                    selectedSourceIds: {
                      ...current[selectedPool].selectedSourceIds,
                      assetA: sourceId,
                    },
                  },
                }))
              }
              isActive={formState.activeSide === "assetA"}
            />
            <SidePanel
              side="assetB"
              pool={pool}
              source={{ side: "assetB", title: pool.token1?.symbol ?? "Asset B" }}
              selectedSource={selectedSourceB}
              sources={sourcesBySide.assetB}
              inputValue={formState.draftAmounts.assetB}
              quotedValue={sideDisplayValue("assetB")}
              balanceRaw={selectedSourceB?.balanceRaw ?? null}
              onFocus={() => activateSide("assetB", sideDisplayValue("assetB"))}
              onChange={(value) => handleAmountChange("assetB", value)}
              onMax={() => setMaxForSide("assetB")}
              onSelectSource={(sourceId) =>
                setPoolFormStateByKey((current) => ({
                  ...current,
                  [selectedPool]: {
                    ...current[selectedPool],
                    selectedSourceIds: {
                      ...current[selectedPool].selectedSourceIds,
                      assetB: sourceId,
                    },
                  },
                }))
              }
              isActive={formState.activeSide === "assetB"}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <QuoteStat
              label="Expected liquidity"
              value={quoteSummaryValue(quote.liquidityRaw, 0)}
              detail={quote.status === "ok" ? "Derived from the selected range and active side." : "Preview only until the quote is valid."}
            />
            <QuoteStat
              label="Asset A used / unused"
              value={
                quote.amountAUsedRaw !== null && quote.amountAUnusedRaw !== null
                  ? `${quoteSummaryValue(quote.amountAUsedRaw, pool.token0?.decimals ?? 18)} / ${quoteSummaryValue(quote.amountAUnusedRaw, pool.token0?.decimals ?? 18)}`
                  : "Unavailable"
              }
              detail={pool.token0?.symbol ?? "Asset A"}
            />
            <QuoteStat
              label="Asset B used / unused"
              value={
                quote.amountBUsedRaw !== null && quote.amountBUnusedRaw !== null
                  ? `${quoteSummaryValue(quote.amountBUsedRaw, pool.token1?.decimals ?? 18)} / ${quoteSummaryValue(quote.amountBUnusedRaw, pool.token1?.decimals ?? 18)}`
                  : "Unavailable"
              }
              detail={pool.token1?.symbol ?? "Asset B"}
            />
            <QuoteStat
              label="Begins in range"
              value={rangeStartsInRange ? "Yes" : "No"}
              detail={currentTick === null ? "Current tick unavailable" : `Current tick ${currentTick.toString()}`}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <QuoteStat
              label="Slippage minimums"
              value={
                quote.amountAMinimumRaw !== null && quote.amountBMinimumRaw !== null
                  ? `${quoteSummaryValue(quote.amountAMinimumRaw, pool.token0?.decimals ?? 18)} / ${quoteSummaryValue(quote.amountBMinimumRaw, pool.token1?.decimals ?? 18)}`
                  : "Unavailable"
              }
              detail="amountAMinimum / amountBMinimum"
            />
            <QuoteStat
              label="Current price"
              value={currentPriceText}
              detail={currentTick === null ? "Price unavailable" : `Range preset: ${rangePresetLabel}`}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">Liquidity plan</p>
                <p className="text-xs text-white/45">
                  Typed router inputs ready for the Aurove Zap Router overload.
                </p>
              </div>
              <Badge className="border-white/12 bg-white/[0.04] text-white/70">
                {quote.routerPlan ? quote.routerPlan.overload : "No plan yet"}
              </Badge>
            </div>

            {quote.routerPlan ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <QuoteStat
                  label="Tick lower"
                  value={quote.routerPlan.params.tickLower.toString()}
                  detail="Snapped to pool spacing"
                />
                <QuoteStat
                  label="Tick upper"
                  value={quote.routerPlan.params.tickUpper.toString()}
                  detail="Snapped to pool spacing"
                />
                <QuoteStat
                  label="Receiver"
                  value={`${quote.routerPlan.params.receiver.slice(0, 6)}…${quote.routerPlan.params.receiver.slice(-4)}`}
                  detail="Wallet receiver"
                />
                <QuoteStat
                  label="Deadline"
                  value={quote.routerPlan.params.deadline.toString()}
                  detail="Unix seconds"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/48">
                {account ? "Adjust the inputs above to build a router plan." : "Connect a wallet to build a router plan."}
              </div>
            )}
          </div>

          <TransactionFlowButton
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
              void portfolio.refresh();
            }}
          >
            Add liquidity
          </TransactionFlowButton>
        </div>
      </CardContent>
    </Card>
  );
}
