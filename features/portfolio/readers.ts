import { erc20Abi, type Abi, type Address, type PublicClient } from "viem";
import type { Id20Portfolio, LiquidityPortfolio, PortfolioDomainMeta, PortfolioReadFailure, PortfolioRegistry, RewardsPortfolio, TranchePortfolio, WalletPortfolio } from "./types";
import { getAmount0BelowRangeForLiquidity, getAmount0ForLiquidity, getAmount1AboveRangeForLiquidity, getAmount1ForLiquidity, tickToSqrtPriceX96BigInt } from "@/components/features/liquidity/slipstream-adapter";

type Result = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
const reason = (error: unknown) => error instanceof Error ? error.message : "Contract read failed";
const meta = (chainId: number, owner: Address, blockNumber: bigint, failures: PortfolioReadFailure[]): PortfolioDomainMeta => ({ chainId, owner, blockNumber, fetchedAt: Date.now(), failures });
const successBigint = (result: Result | undefined) => result?.status === "success" && typeof result.result === "bigint" ? result.result : undefined;
const failure = (key: string, address: Address, fn: string, result: Result | undefined): PortfolioReadFailure => ({ key, contract: address, functionName: fn, reason: result?.status === "failure" ? reason(result.error) : "Malformed contract result" });
function decodeLockedBalance(value: unknown): { amount: bigint; end: bigint; isPermanent: boolean } | null {
  if (Array.isArray(value) && typeof value[0] === "bigint" && typeof value[1] === "bigint") {
    const amount = value[0] < 0n ? -value[0] : value[0];
    return { amount, end: value[1], isPermanent: Boolean(value[2]) };
  }
  if (value && typeof value === "object") {
    const locked = value as { amount?: unknown; end?: unknown; isPermanent?: unknown };
    if (typeof locked.amount === "bigint" && typeof locked.end === "bigint") {
      const amount = locked.amount < 0n ? -locked.amount : locked.amount;
      return { amount, end: locked.end, isPermanent: Boolean(locked.isPermanent) };
    }
  }
  return null;
}

export async function readWalletPortfolio(client: PublicClient, chainId: number, owner: Address, registry: PortfolioRegistry): Promise<WalletPortfolio> {
  const blockNumber = await client.getBlockNumber();
  const results = await client.multicall({ allowFailure: true, blockNumber, contracts: registry.walletAssets.map((asset) => ({ address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })) }) as Result[];
  const assets: WalletPortfolio["assets"] = {}; const failures: PortfolioReadFailure[] = [];
  registry.walletAssets.forEach((asset, index) => { const rawBalance = successBigint(results[index]); if (rawBalance === undefined) failures.push(failure(asset.id, asset.address, "balanceOf", results[index])); else assets[asset.id] = { address: asset.address, symbol: asset.symbol, decimals: asset.decimals, rawBalance }; });
  const veCollections: WalletPortfolio["veCollections"] = {};
  const countResults = await client.multicall({ allowFailure: true, blockNumber, contracts: registry.veCollections.map((item) => ({ address: item.address, abi: item.abi as Abi, functionName: "balanceOf", args: [owner] })) }) as Result[];
  registry.veCollections.forEach((item, index) => { if (successBigint(countResults[index]) === undefined) failures.push(failure(`${item.key}:count`, item.address, "balanceOf", countResults[index])); });
  const tokenRequests = registry.veCollections.flatMap((item, index) => Array.from({ length: Number(successBigint(countResults[index]) ?? 0n) }, (_, tokenIndex) => ({ item, tokenIndex })));
  const idResults = await client.multicall({ allowFailure: true, blockNumber, contracts: tokenRequests.map(({ item, tokenIndex }) => ({ address: item.address, abi: item.abi as Abi, functionName: "ownerToNFTokenIdList", args: [owner, BigInt(tokenIndex)] })) }) as Result[];
  const idsByKey = new Map<string, bigint[]>(); tokenRequests.forEach(({ item }, index) => { const tokenId = successBigint(idResults[index]); if (tokenId === undefined) failures.push(failure(`${item.key}:index:${index}`, item.address, "ownerToNFTokenIdList", idResults[index])); else idsByKey.set(item.key, [...(idsByKey.get(item.key) ?? []), tokenId]); });
  const lockRequests = registry.veCollections.flatMap((item) => (idsByKey.get(item.key) ?? []).map((tokenId) => ({ item, tokenId })));
  const lockResults = await client.multicall({ allowFailure: true, blockNumber, contracts: lockRequests.map(({ item, tokenId }) => ({ address: item.address, abi: item.abi as Abi, functionName: "locked", args: [tokenId] })) }) as Result[];
  registry.veCollections.forEach((item) => { veCollections[item.key] = { address: item.address, symbol: item.symbol, tokenIds: idsByKey.get(item.key) ?? [], positions: {} }; });
  lockRequests.forEach(({ item, tokenId }, index) => { const result = lockResults[index]; const locked = result?.status === "success" ? decodeLockedBalance(result.result) : null; if (!locked) { failures.push(failure(`${item.key}:${tokenId}`, item.address, "locked", result)); return; } const lockAmountRaw = locked.amount > 0n ? locked.amount : 0n; veCollections[item.key]!.positions[tokenId.toString()] = { tokenId, lockAmountRaw, lockEnd: locked.end, isPermanent: locked.isPermanent, availableFractionCapacityRaw: lockAmountRaw }; });
  return { meta: meta(chainId, owner, blockNumber, failures), assets, veCollections };
}

export async function readTranchePortfolio(client: PublicClient, chainId: number, owner: Address, registry: PortfolioRegistry): Promise<TranchePortfolio> {
  const blockNumber = await client.getBlockNumber(); const failures: PortfolioReadFailure[] = []; const balances: TranchePortfolio["balances"] = {};
  if (!registry.tranches.length) return { meta: meta(chainId, owner, blockNumber, failures), balances };
  const result = await client.readContract({ address: registry.ledger, abi: registry.ledgerAbi as Abi, functionName: "balanceOfBatch", args: [registry.tranches.map(() => owner), registry.tranches.map((item) => item.trancheId)], blockNumber }).catch((error: unknown) => { failures.push({ key: "tranches", contract: registry.ledger, functionName: "balanceOfBatch", reason: reason(error) }); return null; });
  if (Array.isArray(result)) registry.tranches.forEach((item, index) => { const rawBalance = result[index]; if (typeof rawBalance === "bigint") balances[item.key] = { ...item, rawBalance }; else failures.push({ key: item.key, contract: registry.ledger, functionName: "balanceOfBatch", reason: "Malformed contract result" }); });
  return { meta: meta(chainId, owner, blockNumber, failures), balances };
}

export async function readId20Portfolio(client: PublicClient, chainId: number, owner: Address, registry: PortfolioRegistry): Promise<Id20Portfolio> {
  const blockNumber = await client.getBlockNumber(); const results = await client.multicall({ allowFailure: true, blockNumber, contracts: registry.id20s.map((item) => ({ address: item.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })) }) as Result[];
  const balances: Id20Portfolio["balances"] = {}; const failures: PortfolioReadFailure[] = [];
  registry.id20s.forEach((item, index) => { const rawBalance = successBigint(results[index]); if (rawBalance === undefined) failures.push(failure(item.key, item.address, "balanceOf", results[index])); else balances[item.key] = { ...item, rawBalance }; });
  return { meta: meta(chainId, owner, blockNumber, failures), balances };
}

export async function readRewardsPortfolio(client: PublicClient, chainId: number, owner: Address, registry: PortfolioRegistry): Promise<RewardsPortfolio> {
  const blockNumber = await client.getBlockNumber();
  let sources = [...registry.rewardSources]; const failures: PortfolioReadFailure[] = [];
  if (registry.vault) {
    const sinkResults = await client.multicall({ allowFailure: true, blockNumber, contracts: registry.tranches.map((item) => ({ address: registry.vault!.address, abi: registry.vault!.abi as Abi, functionName: "rewardSinkOfTranche", args: [item.trancheId] })) }) as Result[];
    sources = registry.tranches.flatMap((item, index) => { const result = sinkResults[index]; const address = result?.status === "success" && typeof result.result === "string" ? result.result as Address : undefined; if (!address || /^0x0{40}$/i.test(address)) { if (result?.status === "failure") failures.push(failure(item.key, registry.vault!.address, "rewardSinkOfTranche", result)); return []; } const walletAsset = registry.walletAssets.find((asset) => asset.id === (item.variant === 1 ? "BTC" : "MEZO")); return walletAsset ? [{ key: item.key, address, rewardToken: walletAsset.address, symbol: walletAsset.symbol, decimals: walletAsset.decimals, assetId: walletAsset.id }] : []; });
  }
  const results = await client.multicall({ allowFailure: true, blockNumber, contracts: sources.map((item) => ({ address: item.address, abi: registry.rewardSinkAbi as Abi, functionName: "claimableRewards", args: [owner] })) }) as Result[];
  const rewards: RewardsPortfolio["rewards"] = {};
  sources.forEach((item, index) => { const rawClaimable = successBigint(results[index]); if (rawClaimable === undefined) failures.push(failure(item.key, item.address, "claimableRewards", results[index])); else rewards[item.key] = { assetId: item.assetId, token: item.rewardToken, symbol: item.symbol, decimals: item.decimals, rawClaimable, source: item.address }; });
  return { meta: meta(chainId, owner, blockNumber, failures), rewards };
}

function tuple(value: unknown): readonly unknown[] | null { return Array.isArray(value) ? value : null; }
const UINT128_MAX = (1n << 128n) - 1n;
const UINT256_MODULUS = 1n << 256n;
const Q128 = 1n << 128n;
const subUint256 = (a: bigint, b: bigint) => (a - b + UINT256_MODULUS) % UINT256_MODULUS;
function collectableFromFeeGrowth(params: {
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  global0: bigint;
  global1: bigint;
  lowerOutside0: bigint;
  lowerOutside1: bigint;
  upperOutside0: bigint;
  upperOutside1: bigint;
  lastInside0: bigint;
  lastInside1: bigint;
  storedOwed0: bigint;
  storedOwed1: bigint;
}) {
  const growthInside = (global: bigint, lowerOutside: bigint, upperOutside: bigint) => {
    const below = params.currentTick >= params.tickLower ? lowerOutside : subUint256(global, lowerOutside);
    const above = params.currentTick < params.tickUpper ? upperOutside : subUint256(global, upperOutside);
    return subUint256(subUint256(global, below), above);
  };
  const inside0 = growthInside(params.global0, params.lowerOutside0, params.upperOutside0);
  const inside1 = growthInside(params.global1, params.lowerOutside1, params.upperOutside1);
  return {
    amount0: params.storedOwed0 + (params.liquidity * subUint256(inside0, params.lastInside0)) / Q128,
    amount1: params.storedOwed1 + (params.liquidity * subUint256(inside1, params.lastInside1)) / Q128,
  };
}
export async function readLiquidityPortfolio(client: PublicClient, chainId: number, owner: Address, registry: PortfolioRegistry): Promise<LiquidityPortfolio> {
  const blockNumber = await client.getBlockNumber();
  const failures: PortfolioReadFailure[] = [];
  const positions: LiquidityPortfolio["positions"] = {};
  const manager = registry.positionManager;
  if (!manager) return { meta: meta(chainId, owner, blockNumber, failures), positionIds: [], positions };

  const countResult = await client.readContract({
    address: manager.address,
    abi: manager.abi as Abi,
    functionName: "balanceOf",
    args: [owner],
    blockNumber,
  }).catch((error: unknown) => {
    failures.push({ key: "position-count", contract: manager.address, functionName: "balanceOf", reason: reason(error) });
    return 0n;
  });
  const count = typeof countResult === "bigint" ? countResult : 0n;
  const idResults = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: Array.from({ length: Number(count) }, (_, index) => ({
      address: manager.address,
      abi: manager.abi as Abi,
      functionName: "tokenOfOwnerByIndex",
      args: [owner, BigInt(index)],
    })),
  }) as Result[];
  const walletPositionIds = idResults.flatMap((result, index) => {
    const id = successBigint(result);
    if (id === undefined) {
      failures.push(failure(`position-index-${index}`, manager.address, "tokenOfOwnerByIndex", result));
      return [];
    }
    return [id];
  });

  // Positions deposited in CL gauges are owned by the gauge, not the wallet.
  const stakedByTokenId = new Map<string, {
    gaugeAddress: Address;
    poolKey: string;
    pool: Address;
    rewardToken?: Address;
  }>();
  if (registry.clGauges.length > 0) {
    const stakedValueResults = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: registry.clGauges.map((gauge) => ({
        address: gauge.address,
        abi: gauge.abi as Abi,
        functionName: "stakedValues",
        args: [owner],
      })),
    }) as Result[];
    registry.clGauges.forEach((gauge, index) => {
      const result = stakedValueResults[index];
      if (result?.status !== "success" || !Array.isArray(result.result)) {
        if (result?.status === "failure") {
          failures.push(failure(`${gauge.key}:staked`, gauge.address, "stakedValues", result));
        }
        return;
      }
      for (const tokenId of result.result) {
        if (typeof tokenId !== "bigint") continue;
        stakedByTokenId.set(tokenId.toString(), {
          gaugeAddress: gauge.address,
          poolKey: gauge.poolKey,
          pool: gauge.pool,
          rewardToken: gauge.rewardToken,
        });
      }
    });
  }

  const positionIds = [
    ...walletPositionIds,
    ...[...stakedByTokenId.keys()]
      .map((id) => BigInt(id))
      .filter((id) => !walletPositionIds.some((walletId) => walletId === id)),
  ];

  const detailResults = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: positionIds.map((id) => ({
      address: manager.address,
      abi: manager.abi as Abi,
      functionName: "positions",
      args: [id],
    })),
  }) as Result[];
  const decoded = positionIds.flatMap((tokenId, index) => {
    const result = detailResults[index];
    const values = result?.status === "success" ? tuple(result.result) : null;
    if (!values || values.length < 12) {
      failures.push(failure(tokenId.toString(), manager.address, "positions", result));
      return [];
    }
    return [{
      tokenId,
      values,
      token0: values[2] as Address,
      token1: values[3] as Address,
      tickSpacing: Number(values[4]),
      staked: stakedByTokenId.get(tokenId.toString()),
    }];
  });

  const poolResults = registry.factory
    ? await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: decoded.map((item) => ({
        address: registry.factory!.address,
        abi: registry.factory!.abi as Abi,
        functionName: "getPool",
        args: [item.token0, item.token1, item.tickSpacing],
      })),
    }) as Result[]
    : [];

  const supported = decoded.flatMap((item, index) => {
    const staked = item.staked;
    let pool = staked?.pool;
    if (!pool) {
      const poolResult = poolResults[index];
      pool = poolResult?.status === "success" && typeof poolResult.result === "string"
        ? poolResult.result as Address
        : "0x0000000000000000000000000000000000000000" as Address;
      if (registry.factory && poolResult?.status !== "success") {
        failures.push(failure(`${item.tokenId}-pool`, registry.factory.address, "getPool", poolResult));
      }
    }
    const config = registry.supportedPools.find(
      (candidate) => candidate.address.toLowerCase() === pool!.toLowerCase(),
    ) ?? (staked
      ? registry.supportedPools.find((candidate) => candidate.key === staked.poolKey)
      : undefined);
    return config ? [{ item, pool: pool!, config, staked }] : [];
  });

  const stateResults = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: supported.flatMap(({ item, pool, config }) => [
      { address: pool, abi: config.abi as Abi, functionName: "slot0" },
      { address: pool, abi: config.abi as Abi, functionName: "liquidity" },
      { address: pool, abi: config.abi as Abi, functionName: "feeGrowthGlobal0X128" },
      { address: pool, abi: config.abi as Abi, functionName: "feeGrowthGlobal1X128" },
      { address: pool, abi: config.abi as Abi, functionName: "ticks", args: [Number(item.values[5])] },
      { address: pool, abi: config.abi as Abi, functionName: "ticks", args: [Number(item.values[6])] },
    ]),
  }) as Result[];

  const unstakedSupported = supported.filter(({ staked }) => !staked);
  const collectResults = await Promise.allSettled(unstakedSupported.map(({ item }) => client.simulateContract({
    account: owner,
    address: manager.address,
    abi: manager.abi as Abi,
    functionName: "collect",
    args: [{ tokenId: item.tokenId, recipient: owner, amount0Max: UINT128_MAX, amount1Max: UINT128_MAX }],
    blockNumber,
  })));
  const collectIndexByTokenId = new Map(
    unstakedSupported.map((entry, index) => [entry.item.tokenId.toString(), index]),
  );

  const stakedSupported = supported.filter(({ staked }) => Boolean(staked));
  const earnedResults = stakedSupported.length > 0
    ? await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: stakedSupported.map(({ item, staked }) => ({
        address: staked!.gaugeAddress,
        abi: registry.clGauges.find((gauge) => gauge.address.toLowerCase() === staked!.gaugeAddress.toLowerCase())!.abi as Abi,
        functionName: "earned",
        args: [owner, item.tokenId],
      })),
    }) as Result[]
    : [];
  const earnedByTokenId = new Map(
    stakedSupported.map((entry, index) => [entry.item.tokenId.toString(), successBigint(earnedResults[index])]),
  );

  supported.forEach(({ item, pool, config, staked }, index) => {
    const state = stateResults.slice(index * 6, index * 6 + 6);
    const slotValues = state[0]?.status === "success" ? tuple(state[0].result) : null;
    const sqrtPriceX96 = slotValues && typeof slotValues[0] === "bigint" ? slotValues[0] : undefined;
    const currentTick = slotValues && typeof slotValues[1] === "number" ? slotValues[1] : undefined;
    const poolLiquidity = successBigint(state[1]);
    const tickLower = Number(item.values[5]);
    const tickUpper = Number(item.values[6]);
    const liquidity = item.values[7] as bigint;
    let rawAmount0: bigint | undefined;
    let rawAmount1: bigint | undefined;
    if (sqrtPriceX96 !== undefined && currentTick !== undefined) {
      const lower = tickToSqrtPriceX96BigInt(tickLower);
      const upper = tickToSqrtPriceX96BigInt(tickUpper);
      if (currentTick < tickLower) {
        rawAmount0 = getAmount0BelowRangeForLiquidity({ liquidity, sqrtLowerX96: lower, sqrtUpperX96: upper });
        rawAmount1 = 0n;
      } else if (currentTick >= tickUpper) {
        rawAmount0 = 0n;
        rawAmount1 = getAmount1AboveRangeForLiquidity({ liquidity, sqrtLowerX96: lower, sqrtUpperX96: upper });
      } else {
        rawAmount0 = getAmount0ForLiquidity({ liquidity, sqrtCurrentX96: sqrtPriceX96, sqrtUpperX96: upper });
        rawAmount1 = getAmount1ForLiquidity({ liquidity, sqrtLowerX96: lower, sqrtCurrentX96: sqrtPriceX96 });
      }
    }

    let collectible0 = 0n;
    let collectible1 = 0n;
    if (!staked) {
      const collectIndex = collectIndexByTokenId.get(item.tokenId.toString());
      const collect = collectIndex === undefined ? undefined : collectResults[collectIndex];
      const collectTuple = collect?.status === "fulfilled" ? tuple(collect.value.result) : null;
      let amount0 = collectTuple && typeof collectTuple[0] === "bigint" ? collectTuple[0] : undefined;
      let amount1 = collectTuple && typeof collectTuple[1] === "bigint" ? collectTuple[1] : undefined;
      if (amount0 === undefined || amount1 === undefined) {
        const lowerTick = state[4]?.status === "success" ? tuple(state[4].result) : null;
        const upperTick = state[5]?.status === "success" ? tuple(state[5].result) : null;
        const global0 = successBigint(state[2]);
        const global1 = successBigint(state[3]);
        if (
          currentTick !== undefined
          && global0 !== undefined
          && global1 !== undefined
          && lowerTick
          && upperTick
          && typeof lowerTick[2] === "bigint"
          && typeof lowerTick[3] === "bigint"
          && typeof upperTick[2] === "bigint"
          && typeof upperTick[3] === "bigint"
          && typeof item.values[8] === "bigint"
          && typeof item.values[9] === "bigint"
        ) {
          const fallback = collectableFromFeeGrowth({
            currentTick,
            tickLower,
            tickUpper,
            liquidity,
            global0,
            global1,
            lowerOutside0: lowerTick[2],
            lowerOutside1: lowerTick[3],
            upperOutside0: upperTick[2],
            upperOutside1: upperTick[3],
            lastInside0: item.values[8],
            lastInside1: item.values[9],
            storedOwed0: item.values[10] as bigint,
            storedOwed1: item.values[11] as bigint,
          });
          amount0 = fallback.amount0;
          amount1 = fallback.amount1;
        } else {
          failures.push({
            key: `${item.tokenId}-collectable-fees`,
            contract: manager.address,
            functionName: "collect",
            reason: collect?.status === "rejected" ? reason(collect.reason) : "Collect simulation and fee-growth fallback failed",
          });
        }
      }
      collectible0 = amount0 ?? 0n;
      collectible1 = amount1 ?? 0n;
    }

    positions[item.tokenId.toString()] = {
      tokenId: item.tokenId,
      pool,
      poolKey: config.key,
      token0: item.token0,
      token1: item.token1,
      tickSpacing: item.tickSpacing,
      tickLower,
      tickUpper,
      liquidity,
      poolLiquidity,
      currentTick,
      sqrtPriceX96,
      tokensOwed0: collectible0,
      tokensOwed1: collectible1,
      rawAmount0,
      rawAmount1,
      isStaked: Boolean(staked),
      gaugeAddress: staked?.gaugeAddress,
      gaugeEarnedRaw: staked ? earnedByTokenId.get(item.tokenId.toString()) : undefined,
      rewardToken: staked?.rewardToken,
    };
  });

  return {
    meta: meta(chainId, owner, blockNumber, failures),
    positionIds: supported.map(({ item }) => item.tokenId),
    positions,
  };
}
