import { erc20Abi, zeroAddress, type Abi, type Address, type PublicClient } from "viem";
import { getContractConfig, getContractsByChainId } from "@/contracts/shared";
import { getKnownMezoTokenConfigs } from "@/components/shared/known-mezo-tokens";
import { deriveTrancheId, MAX_EPOCHS_BY_VARIANT, nameOf, symbolOf, type CanonicalAssetVariant } from "@/components/features/earn/utils/tranche";
import { getPortfolioRegistry, type WalletPortfolio } from "@/features/portfolio";
import type { SwapAsset, SwapPool, SwapRegistry, SwapRoutingConfig } from "../domain";

type ReadResult = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export function getSwapRoutingConfig(): SwapRoutingConfig {
  return {
    maxHops: boundedInteger(process.env.NEXT_PUBLIC_SWAP_MAX_HOPS, 3, 1, 5),
    maxCandidateRoutes: boundedInteger(process.env.NEXT_PUBLIC_SWAP_MAX_CANDIDATE_ROUTES, 64, 1, 256),
    quoteTtlSeconds: BigInt(boundedInteger(process.env.NEXT_PUBLIC_SWAP_QUOTE_TTL_SECONDS, 30, 5, 300)),
    maxPriceImpactBps: boundedInteger(process.env.NEXT_PUBLIC_SWAP_MAX_PRICE_IMPACT_BPS, 10_000, 1, 10_000),
  };
}

function hasFunction(abi: Abi, name: string): boolean {
  return abi.some((item) => item.type === "function" && item.name === name);
}

function poolCandidates(chainId: number) {
  const contracts = getContractsByChainId(chainId);
  if (!contracts) return [];
  const seen = new Set<string>();
  return Object.entries(contracts).flatMap(([key, contract]) => {
    if (!contract.address || !hasFunction(contract.abi as Abi, "token0") || !hasFunction(contract.abi as Abi, "token1") || !hasFunction(contract.abi as Abi, "tickSpacing") || !hasFunction(contract.abi as Abi, "slot0")) return [];
    const normalized = contract.address.toLowerCase();
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ key, contract: { address: contract.address, abi: contract.abi as Abi } }];
  });
}

export function getSwapPoolAbi(chainId: number): Abi | null {
  return poolCandidates(chainId)[0]?.contract.abi ?? null;
}

export function getSwapAssets(chainId: number): SwapAsset[] {
  const known = getKnownMezoTokenConfigs(chainId);
  return known.map((token) => ({
    id: `erc20:${token.symbol}`, chainId, address: token.address, executableAddress: token.address,
    symbol: token.symbol, name: token.symbol === "MUSD" ? "Mezo USD" : token.symbol,
    decimals: token.decimals, form: "erc20", balanceDomain: "wallet", balanceKey: token.symbol,
  }));
}

function allCanonicalTranches() {
  return (["veBTC", "veMEZO"] as const).flatMap((variant) =>
    Array.from({ length: MAX_EPOCHS_BY_VARIANT[variant] }, (_, index) => {
      const epochs = index + 1;
      return { variant, variantId: variant === "veBTC" ? 1 : 2, epochs, trancheId: deriveTrancheId(variant, epochs) };
    }),
  );
}

export async function loadSwapRegistry(client: PublicClient, chainId: number): Promise<SwapRegistry> {
  if (!getContractsByChainId(chainId)) throw new Error("Swaps are not configured on this network");
  const clRouter = getContractConfig(chainId, "CLSwapRouter");
  const auroveRouter = getContractConfig(chainId, "AuroveZapRouter");
  const ledger = getContractConfig(chainId, "Ledger");
  const clFactory = getContractConfig(chainId, "CLFactory");
  const id20Factory = getContractConfig(chainId, "Id20Factory");
  if (!clRouter?.address || !auroveRouter?.address || !ledger?.address || !clFactory?.address || !id20Factory?.address) throw new Error("Swap routers are not deployed");
  const configuredPools = poolCandidates(chainId);
  const poolAbi = getSwapPoolAbi(chainId);
  if (!poolAbi) throw new Error("Concentrated-liquidity pool ABI is unavailable");
  const poolCount = await client.readContract({ address: clFactory.address, abi: clFactory.abi, functionName: "allPoolsLength" });
  if (typeof poolCount !== "bigint" || poolCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Pool registry returned an invalid length");
  const poolAddressResults = await client.multicall({ allowFailure: true, contracts: Array.from({ length: Number(poolCount) }, (_, index) => ({
    address: clFactory.address!, abi: clFactory.abi, functionName: "allPools", args: [BigInt(index)],
  })) }) as ReadResult[];
  const poolAddresses = poolAddressResults.flatMap((result) => result.status === "success" && typeof result.result === "string" ? [result.result as Address] : []);
  const results = await client.multicall({ allowFailure: true, contracts: poolAddresses.flatMap((address) => [
    { address, abi: poolAbi, functionName: "token0" },
    { address, abi: poolAbi, functionName: "token1" },
    { address, abi: poolAbi, functionName: "tickSpacing" },
    { address, abi: poolAbi, functionName: "fee" },
  ]) }) as ReadResult[];
  const pools: SwapPool[] = poolAddresses.flatMap((address, index) => {
    const values = results.slice(index * 4, index * 4 + 4);
    if (values.some((item) => item.status !== "success")) return [];
    const [token0, token1, tickSpacing, fee] = values.map((item) => item.status === "success" ? item.result : null);
    if (typeof token0 !== "string" || typeof token1 !== "string" || typeof tickSpacing !== "number" || typeof fee !== "number") return [];
    const configured = configuredPools.find((candidate) => candidate.contract.address.toLowerCase() === address.toLowerCase());
    return [{ key: configured?.key ?? `cl:${address.toLowerCase()}`, address, abi: poolAbi, token0: token0 as Address, token1: token1 as Address, tickSpacing, fee }];
  });
  const portfolio = getPortfolioRegistry(chainId);
  const configuredAssets = getSwapAssets(chainId);
  const trancheDefinitions = allCanonicalTranches();
  const wrapperResults = await client.multicall({ allowFailure: true, contracts: trancheDefinitions.map((tranche) => ({
    address: id20Factory.address!, abi: id20Factory.abi, functionName: "getId20", args: [tranche.trancheId],
  })) }) as ReadResult[];
  const deployedWrappers = trancheDefinitions.flatMap((tranche, index) => {
    const result = wrapperResults[index];
    const address = result?.status === "success" && typeof result.result === "string" ? result.result as Address : zeroAddress;
    return address.toLowerCase() === zeroAddress ? [] : [{ ...tranche, address }];
  });
  const wrapperAssets: SwapAsset[] = deployedWrappers.map((wrapper) => ({
    id: `id20:${wrapper.address.toLowerCase()}`, chainId, address: wrapper.address, executableAddress: wrapper.address,
    symbol: symbolOf(wrapper.variant, wrapper.epochs), name: nameOf(wrapper.variant, wrapper.epochs), decimals: 18,
    form: "id20", balanceDomain: "id20", balanceKey: `id20:${wrapper.address.toLowerCase()}`,
    trancheId: wrapper.trancheId, variant: wrapper.variantId, epochs: BigInt(wrapper.epochs), wrapperAddress: wrapper.address,
  }));
  const trancheAssets: SwapAsset[] = deployedWrappers.map((wrapper) => ({
    id: `tranche:${wrapper.trancheId}`, chainId, address: ledger.address!, executableAddress: wrapper.address,
    symbol: symbolOf(wrapper.variant, wrapper.epochs), name: `${nameOf(wrapper.variant, wrapper.epochs)} tranche`, decimals: 18,
    form: "tranche", balanceDomain: "tranches", balanceKey: `tranche:${wrapper.trancheId}`,
    trancheId: wrapper.trancheId, variant: wrapper.variantId, epochs: BigInt(wrapper.epochs), wrapperAddress: wrapper.address,
  }));
  const underlyingAssets: SwapAsset[] = deployedWrappers.flatMap((wrapper) => {
    if (wrapper.epochs !== MAX_EPOCHS_BY_VARIANT[wrapper.variant]) return [];
    const symbol = wrapper.variant === "veBTC" ? "BTC" : "MEZO";
    const underlying = configuredAssets.find((asset) => asset.symbol === symbol);
    if (!underlying) return [];
    return [{
      id: `underlying:${wrapper.variantId}:${wrapper.epochs}`,
      chainId,
      address: underlying.address,
      executableAddress: wrapper.address,
      symbol: underlying.symbol,
      name: `${underlying.name} deposit into ${nameOf(wrapper.variant, wrapper.epochs)}`,
      decimals: underlying.decimals,
      form: "underlying",
      balanceDomain: "wallet",
      balanceKey: underlying.balanceKey,
      trancheId: wrapper.trancheId,
      variant: wrapper.variantId,
      epochs: BigInt(wrapper.epochs),
      wrapperAddress: wrapper.address,
    }];
  });
  const poolTokens = [...new Set(pools.flatMap((pool) => [pool.token0.toLowerCase(), pool.token1.toLowerCase()]))] as Address[];
  const routableAssets = [...configuredAssets, ...wrapperAssets];
  const missingTokens = poolTokens.filter((address) => !routableAssets.some((asset) => asset.executableAddress.toLowerCase() === address));
  const metadata = await client.multicall({ allowFailure: true, contracts: missingTokens.flatMap((address) => [
    { address, abi: erc20Abi, functionName: "symbol" },
    { address, abi: erc20Abi, functionName: "name" },
    { address, abi: erc20Abi, functionName: "decimals" },
  ]) }) as ReadResult[];
  const discoveredAssets: SwapAsset[] = missingTokens.flatMap((address, index) => {
    const [symbolResult, nameResult, decimalsResult] = metadata.slice(index * 3, index * 3 + 3);
    const symbol = symbolResult?.status === "success" ? symbolResult.result : null;
    const name = nameResult?.status === "success" ? nameResult.result : null;
    const decimals = decimalsResult?.status === "success" ? decimalsResult.result : null;
    if (typeof symbol !== "string" || typeof name !== "string" || typeof decimals !== "number") return [];
    const canonicalWalletAsset = configuredAssets.find((asset) => asset.balanceDomain === "wallet" && asset.address.toLowerCase() === address.toLowerCase());
    return [{
      id: `erc20:${address.toLowerCase()}`, chainId, address, executableAddress: address,
      symbol, name, decimals, form: "erc20", balanceDomain: "wallet",
      balanceKey: canonicalWalletAsset?.balanceKey ?? `cl:${address.toLowerCase()}`,
    }];
  });
  const assets = [...configuredAssets, ...underlyingAssets, ...wrapperAssets, ...trancheAssets, ...discoveredAssets];
  return {
    chainId,
    revision: `${portfolio?.revision ?? ""}:${pools.map((pool) => `${pool.address}:${pool.tickSpacing}:${pool.fee}`).join("|")}`,
    clRouter: { address: clRouter.address, abi: clRouter.abi as Abi },
    auroveRouter: { address: auroveRouter.address, abi: auroveRouter.abi as Abi },
    ledger: { address: ledger.address, abi: ledger.abi as Abi },
    assets, pools, routing: getSwapRoutingConfig(),
  };
}

export function withWalletVeNfts(registry: SwapRegistry | undefined, wallet: WalletPortfolio | undefined): SwapRegistry | undefined {
  if (!registry || !wallet) return registry;
  const marketAssets = registry.assets.filter((asset) => asset.form !== "venft");
  const veNftAssets = Object.entries(wallet.veCollections).flatMap(([key, collection]) => {
    if (key !== "veBTC" && key !== "veMEZO") return [];
    const variant = key as CanonicalAssetVariant;
    const variantId = variant === "veBTC" ? 1 : 2;
    const epochs = MAX_EPOCHS_BY_VARIANT[variant];
    const trancheId = deriveTrancheId(variant, epochs);
    const wrapper = marketAssets.find((asset) => asset.form === "id20" && asset.trancheId === trancheId);
    if (!wrapper) return [];
    return collection.tokenIds.flatMap((tokenId): SwapAsset[] => {
      const position = collection.positions[tokenId.toString()];
      if (!position || position.lockAmountRaw <= 0n) return [];
      return [{
        id: `venft:${collection.address.toLowerCase()}:${tokenId}`,
        chainId: registry.chainId,
        address: collection.address,
        executableAddress: wrapper.address,
        symbol: `${collection.symbol} #${tokenId}`,
        name: `${collection.symbol} position`,
        decimals: 18,
        form: "venft",
        balanceDomain: "wallet",
        balanceKey: `${key}:${tokenId}`,
        trancheId,
        variant: variantId,
        epochs: BigInt(epochs),
        wrapperAddress: wrapper.address,
        tokenId,
        fixedInputAmount: position.lockAmountRaw,
      }];
    });
  });
  return { ...registry, assets: [...marketAssets, ...veNftAssets] };
}
