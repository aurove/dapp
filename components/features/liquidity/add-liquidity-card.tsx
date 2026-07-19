"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
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

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { usePortfolioSummary, type PortfolioSummary, type WalletPortfolio } from "@/features/portfolio";
import { useChainTime } from "@/lib/web3/use-chain-time";
import { formatCompactRawTokenAmount, parseAmountRaw, readResult } from "@/lib/web3/value-parsers";
import TransactionFlowButton from "@/lib/tx-flow/TransactionFlowButton";
import { makeAddressWriteStep, makeContractWriteStep, type TxStep } from "@/lib/tx-flow";
import { LiquidityRangeGraph } from "./liquidity-range-graph";
import { useSlipstreamPoolState } from "./liquidity-range-graph";
import { LiquidityTokenInput } from "./liquidity-token-input";
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

function sourceFamilyLabel(family: SlipstreamSourceFamily) {
  if (family === "BTC") return "BTC";
  if (family === "MEZO") return "MEZO";
  if (family === "MUSD") return "MUSD";
  return "Unknown";
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
  portfolio: PortfolioSummary | undefined;
  veCollections: WalletPortfolio["veCollections"];
  allowancesByAddress: Record<string, bigint>;
}) {
  const { pool, portfolio, veCollections, allowancesByAddress } = params;
  const token0Family = sourceFamilyForToken(pool.token0?.symbol);
  const token1Family = sourceFamilyForToken(pool.token1?.symbol);

  const buildSideSources = (
    side: SlipstreamLiquiditySide,
    family: SlipstreamSourceFamily,
    tokenAddress: Address | null,
    tokenSymbol: string | null,
    tokenDecimals: number,
  ) => {
    const options: SlipstreamLiquiditySource[] = [];
    const managedDepositDefaults = sourceDefaultVariantAndEpochs(family);
    const directId20 = Object.values(portfolio?.id20Balances ?? {}).find(
      (asset) => tokenAddress && asset.address.toLowerCase() === tokenAddress.toLowerCase(),
    );
    const directAsset = directId20 ?? Object.values(portfolio?.walletAssets ?? {}).find(
      (asset) => tokenAddress && asset.address.toLowerCase() === tokenAddress.toLowerCase(),
    );
    const underlyingAsset = family === "BTC" || family === "MEZO" ? portfolio?.walletAssets[family] : undefined;

    if (tokenAddress) {
      options.push({
        id: `${side}:${family.toLowerCase()}:${directId20 ? "wrapped" : "erc20"}`,
        kind: "erc20",
        mode: "plain",
        representation: directId20 ? "wrapped" : "erc20",
        family,
        label: directId20
          ? `${directAsset?.symbol ?? tokenSymbol ?? sourceFamilyLabel(family)} (wrapped)`
          : directAsset?.symbol ?? tokenSymbol ?? sourceFamilyLabel(family),
        token: tokenAddress,
        balanceRaw: directAsset?.rawBalance ?? 0n,
        allowanceRaw: allowancesByAddress[tokenAddress.toLowerCase()] ?? 0n,
        decimals: directAsset?.decimals ?? tokenDecimals,
        variant: 0,
        epochs: 0n,
      });

      if ((family === "BTC" || family === "MEZO") && underlyingAsset) {
        options.push({
          id: `${side}:${family.toLowerCase()}:erc20`,
          kind: "erc20",
          mode: "wrapped",
          representation: "erc20",
          family,
          label: underlyingAsset.symbol,
          token: underlyingAsset.address,
          balanceRaw: underlyingAsset.rawBalance,
          allowanceRaw: allowancesByAddress[underlyingAsset.address.toLowerCase()] ?? 0n,
          decimals: underlyingAsset.decimals,
          variant: managedDepositDefaults.variant,
          epochs: managedDepositDefaults.epochs,
        });
      }
    }

    if (family === "BTC" || family === "MEZO") {
      const collectionKey = family === "BTC" ? "veBTC" : "veMEZO";
      const collection = veCollections[collectionKey];

      const collectionAddress = collection?.address;
      if (collectionAddress) {
        Object.values(collection.positions).forEach((position) => {
          options.push({
            id: `${side}:${family.toLowerCase()}:locked:${position.tokenId.toString()}`,
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
      const wrapper = portfolio?.id20Balances[wrapperKey];
      const tranche = wrapper ? Object.values(portfolio?.trancheBalances ?? {}).find((item) => item.trancheId === wrapper.trancheId) : undefined;
      if (wrapper) {
        options.push({
          id: `${side}:${family.toLowerCase()}:liquid:${wrapper.trancheId.toString()}`,
          kind: "tranche",
          family,
          label: `${tranche?.symbol ?? wrapperKey} (liquid)`,
          contractAddress: wrapper.address,
          trancheId: wrapper.trancheId,
          balanceRaw: tranche?.rawBalance ?? 0n,
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
  );

  const assetBSources = buildSideSources(
    "assetB",
    token1Family,
    pool.token1?.address ?? null,
    pool.token1?.symbol ?? null,
    pool.token1?.decimals ?? 18,
  );

  return {
    assetA: assetASources,
    assetB: assetBSources,
  };
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

export function AddLiquidityCard({ initialPool = "BTC" }: { initialPool?: LiquidityPoolKey }) {
  const chainId = useChainId();
  const { address: account } = useAccount();
  const { chainTimestamp } = useChainTime();
  const portfolio = usePortfolioSummary();
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
  const routerAddress = getContractConfig(chainId, "AuroveZapRouter")?.address ?? null;
  const erc20SourceAddresses = useMemo(() => {
    const addresses = [
      pool.token0?.address,
      pool.token1?.address,
      portfolio.data?.walletAssets.BTC?.address,
      portfolio.data?.walletAssets.MEZO?.address,
    ].filter((address): address is Address => Boolean(address));
    return [...new Map(addresses.map((address) => [address.toLowerCase(), address])).values()];
  }, [pool.token0?.address, pool.token1?.address, portfolio.data?.walletAssets]);
  const allowanceReads = useReadContracts({
    allowFailure: true,
    contracts: account && routerAddress ? erc20SourceAddresses.map((address) => ({
      address,
      abi: erc20Abi,
      functionName: "allowance" as const,
      args: [account, routerAddress] as const,
    })) : [],
    query: {
      enabled: Boolean(account && routerAddress && erc20SourceAddresses.length),
    },
  });
  const allowancesByAddress = useMemo(
    () => Object.fromEntries(erc20SourceAddresses.map((address, index) => [
      address.toLowerCase(),
      readResult<bigint>(allowanceReads.data, index) ?? 0n,
    ])),
    [allowanceReads.data, erc20SourceAddresses],
  );
  const formState = poolFormStateByKey[selectedPool];

  const currentRange = useMemo(() => {
    if (!pool.tickSpacing || pool.currentTick === null) return null;
    return formState.selectedRange ?? buildPresetRange("balanced", pool.currentTick, pool.tickSpacing);
  }, [formState.selectedRange, pool.currentTick, pool.tickSpacing]);

  useEffect(() => {
    if (!currentRange) return;

    const nextInputs = priceInputsForRange({ pool, range: currentRange });

    setPoolFormStateByKey((current) => {
      const nextState = current[selectedPool];
      if (
        nextState.manualRangeInputs.lower === nextInputs.lower &&
        nextState.manualRangeInputs.upper === nextInputs.upper
      ) {
        return current;
      }

      return {
        ...current,
        [selectedPool]: {
          ...nextState,
          manualRangeInputs: nextInputs,
        },
      };
    });
  }, [currentRange, pool, selectedPool]);

  const sourcesBySide = useMemo(
    () =>
      buildSourceOptions({
        pool,
        portfolio: portfolio.data,
        veCollections: portfolio.domains.wallet.data?.veCollections ?? {},
        allowancesByAddress,
      }),
    [portfolio.data, portfolio.domains.wallet.data?.veCollections, pool, allowancesByAddress],
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
            manualRangeInputs: selection.range ? priceInputsForRange({ pool, range: selection.range }) : nextState.manualRangeInputs,
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

        <div className="grid gap-3 md:grid-cols-2">
          <LiquidityTokenInput
            id="liquidity-assetA"
            tokenSymbol={pool.token0?.symbol ?? null}
            value={sideDisplayValue("assetA")}
            balanceLabel={selectedSourceA ? formatCompactRawTokenAmount(selectedSourceA.balanceRaw, selectedSourceA.decimals, pool.token0?.symbol ?? null) : "Unavailable"}
            isEditing={formState.activeSide === "assetA"}
            disabled={!selectedSourceA}
            loading={!pool.token0 || portfolio.isLoading}
            insufficientBalance={quote.status === "insufficient-balance" && formState.activeSide === "assetA"}
            canMax={Boolean(selectedSourceA && selectedSourceA.balanceRaw > 0n)}
            sources={sourcesBySide.assetA}
            selectedSource={selectedSourceA}
            onFocus={() => activateSide("assetA", sideDisplayValue("assetA"))}
            onChange={(value) => handleAmountChange("assetA", normalizeAmountInput(value))}
            onMax={() => setMaxForSide("assetA")}
            onSelectSource={(sourceId) => selectSource("assetA", sourceId)}
          />
          <LiquidityTokenInput
            id="liquidity-assetB"
            tokenSymbol={pool.token1?.symbol ?? null}
            value={sideDisplayValue("assetB")}
            balanceLabel={selectedSourceB ? formatCompactRawTokenAmount(selectedSourceB.balanceRaw, selectedSourceB.decimals, pool.token1?.symbol ?? null) : "Unavailable"}
            isEditing={formState.activeSide === "assetB"}
            disabled={!selectedSourceB}
            loading={!pool.token1 || portfolio.isLoading}
            insufficientBalance={quote.status === "insufficient-balance" && formState.activeSide === "assetB"}
            canMax={Boolean(selectedSourceB && selectedSourceB.balanceRaw > 0n)}
            sources={sourcesBySide.assetB}
            selectedSource={selectedSourceB}
            onFocus={() => activateSide("assetB", sideDisplayValue("assetB"))}
            onChange={(value) => handleAmountChange("assetB", normalizeAmountInput(value))}
            onMax={() => setMaxForSide("assetB")}
            onSelectSource={(sourceId) => selectSource("assetB", sourceId)}
          />
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
                {pool.token0?.symbol ?? "Token 0"} / {pool.token1?.symbol ?? "Token 1"}
              </span>
            </div>
            <input
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
                {pool.token0?.symbol ?? "Token 0"} / {pool.token1?.symbol ?? "Token 1"}
              </span>
            </div>
            <input
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
            Manual range uses token0 to token1 pricing and snaps to the pool tick spacing when applied.
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

          <div className="grid gap-3 md:grid-cols-3">
            <QuoteStat
              label="Liquidity"
              value={quoteSummaryValue(quote.liquidityRaw, 0)}
              detail={quote.status === "ok" ? "Ready" : "Enter an amount to preview"}
            />
            <QuoteStat
              label="Price"
              value={currentPriceText}
              detail={rangePresetLabel}
            />
            <QuoteStat
              label="In range"
              value={rangeStartsInRange ? "Yes" : "No"}
              detail={currentTick === null ? "Waiting for pool" : `Tick ${currentTick.toString()}`}
            />
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
              Object.values(portfolio.domains).forEach((query) => void query.refetch());
            }}
          >
            Add liquidity
          </TransactionFlowButton>
        </div>
      </CardContent>
    </Card>
  );
}
