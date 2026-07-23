import { isAddress, type Address } from "viem";
import type { PortfolioSummary, WalletPortfolio } from "@/features/portfolio";
import { makeTokenApprovalStep, type TxStep } from "@/lib/tx-flow";
import type {
  SlipstreamLiquidityPlan,
  SlipstreamLiquiditySide,
  SlipstreamLiquiditySource,
  SlipstreamRouterSideInput,
  SlipstreamSourceFamily,
} from "./slipstream-liquidity-quote";
import {
  sourceDefaultVariantAndEpochs,
  sourceFamilyForToken,
} from "./slipstream-liquidity-quote";
import type { SlipstreamPoolState } from "./slipstream-adapter";

function sourceFamilyLabel(family: SlipstreamSourceFamily) {
  if (family === "BTC") return "BTC";
  if (family === "MEZO") return "MEZO";
  if (family === "MUSD") return "MUSD";
  return "Unknown";
}

export function resolveSelectedLiquiditySource(
  sources: SlipstreamLiquiditySource[],
  selectedId: string | null,
): SlipstreamLiquiditySource | null {
  if (selectedId) {
    const selected = sources.find((source) => source.id === selectedId);
    if (selected) return selected;
  }
  return sources.find((source) => source.balanceRaw > 0n) ?? sources[0] ?? null;
}

export function buildLiquiditySourceOptions(params: {
  pool: SlipstreamPoolState;
  portfolio: PortfolioSummary | undefined;
  veCollections: WalletPortfolio["veCollections"];
  ledgerAddress?: Address;
}) {
  const { pool, portfolio, veCollections, ledgerAddress } = params;
  const token0Family = sourceFamilyForToken(pool.token0?.symbol);
  const token1Family = sourceFamilyForToken(pool.token1?.symbol);

  const buildSideSources = (
    side: SlipstreamLiquiditySide,
    family: SlipstreamSourceFamily,
    tokenAddress: `0x${string}` | null,
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
          decimals: underlyingAsset.decimals,
          variant: managedDepositDefaults.variant,
          epochs: managedDepositDefaults.epochs,
        });
      }
    }

    if (family === "BTC" || family === "MEZO") {
      const collectionKey = family === "BTC" ? "veBTC" : "veMEZO";
      const collection = veCollections[collectionKey];
      if (collection?.address) {
        Object.values(collection.positions).forEach((position) => {
          options.push({
            id: `${side}:${family.toLowerCase()}:locked:${position.tokenId.toString()}`,
            kind: "venft",
            family,
            label: `${collectionKey} #${position.tokenId.toString()}`,
            contractAddress: collection.address,
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
      const tranche = wrapper
        ? Object.values(portfolio?.trancheBalances ?? {}).find((item) => item.trancheId === wrapper.trancheId)
        : undefined;
      if (wrapper && ledgerAddress) {
        options.push({
          id: `${side}:${family.toLowerCase()}:liquid:${wrapper.trancheId.toString()}`,
          kind: "tranche",
          family,
          label: `${tranche?.symbol ?? wrapperKey} (liquid)`,
          contractAddress: ledgerAddress,
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

  return {
    assetA: buildSideSources("assetA", token0Family, pool.token0?.address ?? null, pool.token0?.symbol ?? null, pool.token0?.decimals ?? 18),
    assetB: buildSideSources("assetB", token1Family, pool.token1?.address ?? null, pool.token1?.symbol ?? null, pool.token1?.decimals ?? 18),
  };
}

export function liquiditySourceApprovalLabel(source: SlipstreamLiquiditySource) {
  if (source.kind === "erc20") return source.label;
  return source.kind === "venft" ? `${source.label} veNFT` : `${source.label} tranche units`;
}

export function buildLiquidityApprovalStep(params: {
  source: SlipstreamLiquiditySource;
  input: SlipstreamRouterSideInput;
  routerAddress: Address;
  suffix: string;
}): TxStep | null {
  const { source, input, routerAddress, suffix } = params;
  const hasDeposit = input.kind === "tranche" ? input.input.amount > 0n : input.input.deposit.value > 0n;
  if (!hasDeposit) return null;
  const common = {
    key: `liquidity-approve-${suffix}`,
    label: `Approve ${liquiditySourceApprovalLabel(source)}`,
    displayLabelBtn: true,
  };

  if (source.kind === "erc20") {
    if (!isAddress(source.token)) throw new Error(`Invalid ERC20 source for ${source.label}.`);
    const amount = input.kind === "erc20"
      ? input.input.deposit.value
      : input.kind === "tranche"
        ? input.input.amount
        : 0n;
    return makeTokenApprovalStep({
      ...common,
      approval: { standard: "erc20", token: source.token, spender: routerAddress, amount },
    });
  }

  if (!isAddress(source.contractAddress)) throw new Error(`Invalid source contract for ${source.label}.`);
  return makeTokenApprovalStep({
    ...common,
    approval: source.kind === "venft"
      ? { standard: "erc721", token: source.contractAddress, operator: routerAddress, scope: { kind: "token", tokenId: source.tokenId } }
      : { standard: "erc1155", token: source.contractAddress, operator: routerAddress },
  });
}

function routerInputValue(input: SlipstreamRouterSideInput) {
  if (input.kind === "erc20") return input.input;
  if (input.kind === "venft") return input.input;
  return input.input;
}

function inputKindName(input: SlipstreamRouterSideInput) {
  if (input.kind === "erc20") return "Erc20";
  if (input.kind === "venft") return "VeNft";
  return "Tranche";
}

export function buildLiquidityRouterCall(
  plan: SlipstreamLiquidityPlan,
  operation: "add" | "increase" = "add",
  positionTokenId?: bigint,
) {
  const suffix = `${inputKindName(plan.inputA)}${inputKindName(plan.inputB)}`;
  const functionName = `${operation === "add" ? "addLiquidity" : "increaseLiquidity"}${suffix}`;
  const params = operation === "add"
    ? plan.params
    : {
        positionTokenId: positionTokenId ?? 0n,
        amountAMinimum: plan.params.amountAMinimum,
        amountBMinimum: plan.params.amountBMinimum,
        deadline: plan.params.deadline,
      };
  return {
    functionName,
    args: [routerInputValue(plan.inputA), routerInputValue(plan.inputB), params],
  };
}
