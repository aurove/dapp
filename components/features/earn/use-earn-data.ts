"use client";

import { useEffect, useMemo, useState } from "react";
import { erc20Abi, parseAbiItem, type Abi, type Address, type PublicClient } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  coreReadQueryOptions,
  detailReadQueryOptions,
  staticReadQueryOptions,
} from "@/lib/web3/read-query-options";
import { findLatestEventLogByChunks, type CachedEventLog } from "@/lib/web3/event-cache";
import { decodeTrancheId, deriveTrancheId } from "@/components/features/trade/utils/tranche";

export type EarnVariant = "veBTC" | "veMEZO";

export type EarnTokenInfo = {
  veNftAddress: Address;
  underlyingAddress: Address | null;
  symbol: string;
  decimals: number;
  balanceRaw: bigint;
  allowanceRaw: bigint;
};

export type EarnProduct = {
  id: string;
  fractionAddress: Address;
  trancheId: bigint;
  trancheNumber: number;
  variant: EarnVariant;
  name: string;
  symbol: string;
  veNFT: Address | null;
  decimals: number;
  lifecycle: number | null;
  totalSupplyRaw: bigint | null;
  userBalanceRaw: bigint;
  claimableRewardsRaw: bigint;
  userAvailableBalanceRaw: bigint;
  rewardAsset: Address | null;
  rewardSymbol: string | null;
  rewardDecimals: number;
  rewardReserveRaw: bigint | null;
  aprRewardAmountRaw: bigint | null;
  aprTotalSupplyAtFundingRaw: bigint | null;
  aprFundingBlockNumber: bigint | null;
  settledUnderlyingRaw: bigint | null;
  targetEpochEnd: bigint | null;
  trancheDuration: bigint | null;
  trancheLengthEpochs: bigint | null;
  isTargetSettlementWindow: boolean;
  isRolloverAvailable: boolean;
  refundablePositions: EarnRefundablePosition[];
};

export type EarnRefundablePosition = {
  key: string;
  veNft: Address;
  tokenId: bigint;
  lockedAmountRaw: bigint;
  unlockTime: bigint | null;
};

type FractionCore = {
  address: Address;
  symbol: string;
  name: string;
  trancheId: bigint;
  veNFT: Address | null;
  decoded: ReturnType<typeof decodeTrancheId>;
};

type AprBasis = {
  rewardAmountRaw: bigint;
  totalSupplyAtFundingRaw: bigint;
  fundingBlockNumber: bigint;
};

type FundingEventSnapshot = {
  amount: bigint;
  blockNumber: bigint;
  logIndex: number;
};

type FundingScanCache = {
  latestByAddress: Map<string, FundingEventSnapshot>;
  checkedTipByAddress: Map<string, bigint>;
  inFlight?: Promise<void>;
};

const REWARDS_FUNDED_SCAN_CHUNK_SIZE = 10_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const assetFractionDeployedEvent = parseAbiItem(
  "event AssetFractionDeployed(address indexed assetFraction,uint256 indexed trancheId,string fractionName)",
);

const rewardsFundedEvent = parseAbiItem(
  "event RewardsFunded(address indexed funder,uint256 amount,uint256 distributedAmount,uint256 undistributedRewards,uint256 rewardReserve)",
);

const fundingScanCacheByChain = new Map<number, FundingScanCache>();
const fractionDeploymentBlockCache = new Map<string, Promise<bigint | null>>();
const totalSupplyAtBlockCache = new Map<string, Promise<bigint | null>>();

function getFundingScanCache(chainId: number): FundingScanCache {
  const existing = fundingScanCacheByChain.get(chainId);
  if (existing) return existing;

  const cache: FundingScanCache = {
    latestByAddress: new Map(),
    checkedTipByAddress: new Map(),
  };
  fundingScanCacheByChain.set(chainId, cache);
  return cache;
}

function isNewerFundingEvent(
  next: FundingEventSnapshot,
  current: FundingEventSnapshot | undefined,
) {
  if (!current) return true;
  if (next.blockNumber !== current.blockNumber) return next.blockNumber > current.blockNumber;
  return next.logIndex > current.logIndex;
}

async function scanRewardsFundedEvents(params: {
  publicClient: PublicClient;
  chainId: number;
  assetLedgerAddress: Address;
  assetLedgerDeploymentBlock: bigint;
  addresses: Address[];
}) {
  const normalizedAddresses = [
    ...new Set(params.addresses.map((address) => address.toLowerCase())),
  ];
  if (normalizedAddresses.length === 0) return new Map<string, FundingEventSnapshot>();

  const cache = getFundingScanCache(params.chainId);
  if (cache.inFlight) await cache.inFlight;

  const scanPromise = (async () => {
    const latestBlock = await params.publicClient.getBlockNumber();
    await Promise.all(
      params.addresses.map(async (address) => {
        const key = address.toLowerCase();
        const checkedTip = cache.checkedTipByAddress.get(key);
        if (checkedTip && checkedTip >= latestBlock) return;

        const deploymentBlock = await readAssetFractionDeploymentBlock({
          publicClient: params.publicClient,
          chainId: params.chainId,
          assetLedgerAddress: params.assetLedgerAddress,
          assetLedgerDeploymentBlock: params.assetLedgerDeploymentBlock,
          fractionAddress: address,
          toBlock: latestBlock,
        });
        if (deploymentBlock === null) return;

        const fromBlock =
          checkedTip && checkedTip + 1n > deploymentBlock ? checkedTip + 1n : deploymentBlock;
        const log = await findLatestEventLogByChunks({
          chainId: params.chainId,
          contractAddress: address,
          eventName: "RewardsFunded",
          fromBlock,
          toBlock: latestBlock,
          chunkSize: REWARDS_FUNDED_SCAN_CHUNK_SIZE,
          fetchRange: async (rangeFromBlock, rangeToBlock) => {
            const logs = await params.publicClient.getLogs({
              address,
              event: rewardsFundedEvent,
              fromBlock: rangeFromBlock,
              toBlock: rangeToBlock,
            });

            return logs
              .filter((item) => item.transactionHash && item.blockNumber !== null)
              .map(
                (item): CachedEventLog => ({
                  address: item.address,
                  transactionHash: item.transactionHash!,
                  blockNumber: item.blockNumber!,
                  logIndex: item.logIndex ?? 0,
                  args: {
                    amount: item.args.amount ?? 0n,
                    distributedAmount: item.args.distributedAmount ?? 0n,
                    undistributedRewards: item.args.undistributedRewards ?? 0n,
                    rewardReserve: item.args.rewardReserve ?? 0n,
                  },
                }),
              );
          },
        });

        if (log) {
          const amount = asBigint(log.args.amount) ?? 0n;
          if (amount > 0n) {
            const snapshot: FundingEventSnapshot = {
              amount,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
            };

            if (isNewerFundingEvent(snapshot, cache.latestByAddress.get(key))) {
              cache.latestByAddress.set(key, snapshot);
            }
          }
        }

        cache.checkedTipByAddress.set(key, latestBlock);
      }),
    );
  })();

  cache.inFlight = scanPromise;

  try {
    await scanPromise;
  } finally {
    if (cache.inFlight === scanPromise) {
      cache.inFlight = undefined;
    }
  }

  return new Map(
    normalizedAddresses
      .map((address) => [address, cache.latestByAddress.get(address)])
      .filter((entry): entry is [string, FundingEventSnapshot] => Boolean(entry[1])),
  );
}

function readAssetFractionDeploymentBlock(params: {
  publicClient: PublicClient;
  chainId: number;
  assetLedgerAddress: Address;
  assetLedgerDeploymentBlock: bigint;
  fractionAddress: Address;
  toBlock: bigint;
}) {
  const cacheKey = [
    params.chainId,
    params.assetLedgerAddress.toLowerCase(),
    params.fractionAddress.toLowerCase(),
  ].join(":");
  const existing = fractionDeploymentBlockCache.get(cacheKey);
  if (existing) return existing;

  const promise = findLatestEventLogByChunks({
    chainId: params.chainId,
    contractAddress: params.assetLedgerAddress,
    eventName: "AssetFractionDeployed",
    args: { assetFraction: params.fractionAddress },
    fromBlock: params.assetLedgerDeploymentBlock,
    toBlock: params.toBlock,
    chunkSize: REWARDS_FUNDED_SCAN_CHUNK_SIZE,
    fetchRange: async (fromBlock, toBlock) => {
      const logs = await params.publicClient.getLogs({
        address: params.assetLedgerAddress,
        event: assetFractionDeployedEvent,
        args: { assetFraction: params.fractionAddress },
        fromBlock,
        toBlock,
      });

      return logs
        .filter((item) => item.transactionHash && item.blockNumber !== null)
        .map(
          (item): CachedEventLog => ({
            address: item.address,
            transactionHash: item.transactionHash!,
            blockNumber: item.blockNumber!,
            logIndex: item.logIndex ?? 0,
            args: {
              assetFraction: item.args.assetFraction,
              trancheId: item.args.trancheId ?? 0n,
              fractionName: item.args.fractionName ?? "",
            },
          }),
        );
    },
  })
    .then((log) => log?.blockNumber ?? null)
    .catch(() => null);

  fractionDeploymentBlockCache.set(cacheKey, promise);
  return promise;
}

function readTotalSupplyAtBlock(params: {
  publicClient: PublicClient;
  chainId: number;
  assetFractionAbi: Abi;
  address: Address;
  blockNumber: bigint;
}) {
  const cacheKey = [
    params.chainId,
    params.address.toLowerCase(),
    params.blockNumber.toString(),
  ].join(":");
  const existing = totalSupplyAtBlockCache.get(cacheKey);
  if (existing) return existing;

  const promise = params.publicClient
    .readContract({
      address: params.address,
      abi: params.assetFractionAbi,
      functionName: "totalSupply",
      blockNumber: params.blockNumber,
    })
    .then(asBigint)
    .catch(() => null);

  totalSupplyAtBlockCache.set(cacheKey, promise);
  return promise;
}

export function asAddress(value: unknown): Address | null {
  return typeof value === "string" && value.startsWith("0x") ? (value as Address) : null;
}

export function asBigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function sameAddress(a: Address | null | undefined, b: Address | null | undefined) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function inferVariantFromSymbol(symbol: string): EarnVariant | null {
  const normalized = symbol.toLowerCase();
  if (normalized.startsWith("fvebtc")) return "veBTC";
  if (normalized.startsWith("fvemezo")) return "veMEZO";
  return null;
}

export function lifecycleLabel(value: number | null): string {
  switch (value) {
    case 0:
      return "Active";
    case 1:
      return "Epoch settling";
    case 2:
      return "Maturity window";
    case 3:
      return "Rollover ready";
    case 4:
      return "Rolled active";
    default:
      return "Unknown";
  }
}

function makeProductFromCore(fraction: FractionCore, userBalanceRaw = 0n): EarnProduct {
  return {
    id: `${fraction.address}-${fraction.trancheId.toString()}`,
    fractionAddress: fraction.address,
    trancheId: fraction.trancheId,
    trancheNumber: fraction.decoded?.trancheNumber ?? Number(fraction.trancheId & 0xffffn),
    variant: fraction.decoded?.variant ?? inferVariantFromSymbol(fraction.symbol) ?? "veMEZO",
    name: fraction.name,
    symbol: fraction.symbol,
    veNFT: fraction.veNFT,
    decimals: 18,
    lifecycle: null,
    totalSupplyRaw: null,
    userBalanceRaw,
    claimableRewardsRaw: 0n,
    userAvailableBalanceRaw: userBalanceRaw,
    rewardAsset: null,
    rewardSymbol: null,
    rewardDecimals: 18,
    rewardReserveRaw: null,
    aprRewardAmountRaw: null,
    aprTotalSupplyAtFundingRaw: null,
    aprFundingBlockNumber: null,
    settledUnderlyingRaw: null,
    targetEpochEnd: null,
    trancheDuration: null,
    trancheLengthEpochs: fraction.decoded?.trancheNumber
      ? BigInt(fraction.decoded.trancheNumber)
      : null,
    isTargetSettlementWindow: false,
    isRolloverAvailable: false,
    refundablePositions: [],
  };
}

export function useEarnData() {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;

  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;
  const veBtc = getContractConfig(chainId, "VeBTC");
  const veMezo = getContractConfig(chainId, "VeMEZO");

  const supportedVeNfts = useMemo(
    () =>
      [
        veBtc?.address
          ? ({ variant: "veBTC", veNftAddress: veBtc.address, abi: veBtc.abi } as const)
          : null,
        veMezo?.address
          ? ({ variant: "veMEZO", veNftAddress: veMezo.address, abi: veMezo.abi } as const)
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [veBtc, veMezo],
  );

  const countRead = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi
        ? [
            {
              address: assetLedger.address,
              abi: assetLedger.abi,
              functionName: "assetFractionCount",
              chainId,
            },
          ]
        : [],
    query: {
      enabled: Boolean(assetLedger?.address && assetLedger.abi),
      ...staticReadQueryOptions,
    },
  });

  const fractionCount = asNumber(countRead.data?.[0]?.result) ?? 0;

  const fractionAddressReads = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi
        ? Array.from({ length: fractionCount }, (_, index) => ({
            address: assetLedger.address,
            abi: assetLedger.abi,
            functionName: "assetFractionAt",
            args: [BigInt(index)],
            chainId,
          }))
        : [],
    query: {
      enabled: Boolean(assetLedger?.address && assetLedger.abi) && fractionCount > 0,
      ...staticReadQueryOptions,
    },
  });

  const fractionAddresses = useMemo(
    () =>
      (fractionAddressReads.data ?? [])
        .map((entry) => asAddress(entry.result))
        .filter((address): address is Address => Boolean(address)),
    [fractionAddressReads.data],
  );

  const fractionCoreReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddresses.flatMap((address) => [
      { address, abi: assetFractionAbi, functionName: "symbol", chainId },
      { address, abi: assetFractionAbi, functionName: "name", chainId },
      { address, abi: assetFractionAbi, functionName: "trancheId", chainId },
      { address, abi: assetFractionAbi, functionName: "veNFT", chainId },
    ]),
    query: {
      enabled: Boolean(assetFractionAbi) && fractionAddresses.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const fractionCore = useMemo<FractionCore[]>(() => {
    return fractionAddresses.map((address, index) => {
      const offset = index * 4;
      const symbolResult = fractionCoreReads.data?.[offset]?.result;
      const nameResult = fractionCoreReads.data?.[offset + 1]?.result;
      const trancheResult = asBigint(fractionCoreReads.data?.[offset + 2]?.result) ?? 0n;
      return {
        address,
        symbol:
          typeof symbolResult === "string" && symbolResult.trim()
            ? symbolResult.trim()
            : `${address.slice(0, 6)}...${address.slice(-4)}`,
        name:
          typeof nameResult === "string" && nameResult.trim() ? nameResult.trim() : "Earn claim",
        trancheId: trancheResult,
        veNFT: asAddress(fractionCoreReads.data?.[offset + 3]?.result),
        decoded: decodeTrancheId(trancheResult),
      };
    });
  }, [fractionAddresses, fractionCoreReads.data]);

  const products = useMemo(() => {
    return fractionCore
      .map((fraction) => {
        const variant =
          fraction.decoded?.variant ??
          (sameAddress(fraction.veNFT, veBtc?.address)
            ? "veBTC"
            : sameAddress(fraction.veNFT, veMezo?.address)
              ? "veMEZO"
              : inferVariantFromSymbol(fraction.symbol));
        if (!variant) return null;
        return makeProductFromCore({
          ...fraction,
          decoded: fraction.decoded
            ? { ...fraction.decoded, variant }
            : { variant, trancheNumber: Number(fraction.trancheId & 0xffffn) },
        });
      })
      .filter((product): product is EarnProduct => Boolean(product))
      .sort((a, b) => a.variant.localeCompare(b.variant) || a.trancheNumber - b.trancheNumber);
  }, [fractionCore, veBtc?.address, veMezo?.address]);

  const ledgerBalanceReads = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi && userAddress
        ? products.map((product) => ({
            address: assetLedger.address,
            abi: assetLedger.abi,
            functionName: "balanceOf",
            args: [userAddress, product.trancheId],
            chainId,
          }))
        : [],
    query: {
      enabled:
        Boolean(assetLedger?.address && assetLedger.abi && userAddress) && products.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const liveProducts = useMemo(() => {
    return products.map((product, index) => ({
      ...product,
      userBalanceRaw: asBigint(ledgerBalanceReads.data?.[index]?.result) ?? 0n,
      userAvailableBalanceRaw: asBigint(ledgerBalanceReads.data?.[index]?.result) ?? 0n,
    }));
  }, [ledgerBalanceReads.data, products]);

  const tokenAddressReads = useReadContracts({
    allowFailure: true,
    contracts: supportedVeNfts.map((item) => ({
      address: item.veNftAddress,
      abi: item.abi,
      functionName: "token",
      chainId,
    })),
    query: {
      enabled: supportedVeNfts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const tokenAddressData = tokenAddressReads.data as readonly { result?: unknown }[] | undefined;
  const underlyingAddresses = useMemo(
    () => supportedVeNfts.map((_, index) => asAddress(tokenAddressData?.[index]?.result)),
    [supportedVeNfts, tokenAddressData],
  );

  const tokenMetaReads = useReadContracts({
    allowFailure: true,
    contracts: underlyingAddresses.flatMap((address) =>
      address
        ? [
            { address, abi: erc20Abi, functionName: "symbol", chainId },
            { address, abi: erc20Abi, functionName: "decimals", chainId },
            ...(userAddress && assetLedger?.address
              ? [
                  {
                    address,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [userAddress],
                    chainId,
                  },
                  {
                    address,
                    abi: erc20Abi,
                    functionName: "allowance",
                    args: [userAddress, assetLedger.address],
                    chainId,
                  },
                ]
              : []),
          ]
        : [],
    ),
    query: {
      enabled: underlyingAddresses.some(Boolean),
      ...coreReadQueryOptions,
    },
  });

  const tokenRowSize = userAddress && assetLedger?.address ? 4 : 2;
  const tokens = useMemo<Record<EarnVariant, EarnTokenInfo | null>>(() => {
    const result: Record<EarnVariant, EarnTokenInfo | null> = { veBTC: null, veMEZO: null };
    let cursor = 0;
    supportedVeNfts.forEach((item, index) => {
      const underlyingAddress = underlyingAddresses[index];
      if (!underlyingAddress) return;
      const symbol = tokenMetaReads.data?.[cursor]?.result;
      const decimals = tokenMetaReads.data?.[cursor + 1]?.result;
      const balance = tokenMetaReads.data?.[cursor + 2]?.result;
      const allowance = tokenMetaReads.data?.[cursor + 3]?.result;
      cursor += tokenRowSize;
      result[item.variant] = {
        veNftAddress: item.veNftAddress,
        underlyingAddress,
        symbol:
          typeof symbol === "string" && symbol.trim() ? symbol : item.variant.replace("ve", ""),
        decimals: asNumber(decimals) ?? 18,
        balanceRaw: asBigint(balance) ?? 0n,
        allowanceRaw: asBigint(allowance) ?? 0n,
      };
    });
    return result;
  }, [supportedVeNfts, underlyingAddresses, tokenMetaReads.data, tokenRowSize]);

  const visibleProducts = useMemo<EarnProduct[]>(() => {
    if (liveProducts.length > 0) return liveProducts;
    return supportedVeNfts.map((item) => ({
      id: `${item.variant}-starter`,
      fractionAddress: ZERO_ADDRESS,
      trancheId: deriveTrancheId(item.variant, 4),
      trancheNumber: 4,
      variant: item.variant,
      name: `${item.variant} liquid lock`,
      symbol: `f${item.variant}-W4`,
      veNFT: item.veNftAddress,
      decimals: 18,
      lifecycle: null,
      totalSupplyRaw: null,
      userBalanceRaw: 0n,
      claimableRewardsRaw: 0n,
      userAvailableBalanceRaw: 0n,
      rewardAsset: null,
      rewardSymbol: null,
      rewardDecimals: 18,
      rewardReserveRaw: null,
      aprRewardAmountRaw: null,
      aprTotalSupplyAtFundingRaw: null,
      aprFundingBlockNumber: null,
      settledUnderlyingRaw: null,
      targetEpochEnd: null,
      trancheDuration: null,
      trancheLengthEpochs: 4n,
      isTargetSettlementWindow: false,
      isRolloverAvailable: false,
      refundablePositions: [],
    }));
  }, [liveProducts, supportedVeNfts]);

  function refresh() {
    void countRead.refetch();
    void fractionAddressReads.refetch();
    void fractionCoreReads.refetch();
    void ledgerBalanceReads.refetch();
    void tokenAddressReads.refetch();
    void tokenMetaReads.refetch();
  }

  const error =
    (countRead.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionCoreReads.error as Error | null) ||
    (ledgerBalanceReads.error as Error | null) ||
    (tokenAddressReads.error as Error | null) ||
    (tokenMetaReads.error as Error | null) ||
    null;

  return {
    chainId,
    assetLedger,
    assetFractionAbi,
    products: visibleProducts,
    liveProductCount: liveProducts.length,
    userPositions: liveProducts.filter((product) => product.userBalanceRaw > 0n),
    supportedVeNfts,
    tokens,
    isLoading:
      countRead.isLoading ||
      fractionAddressReads.isLoading ||
      fractionCoreReads.isLoading ||
      ledgerBalanceReads.isLoading ||
      tokenAddressReads.isLoading ||
      tokenMetaReads.isLoading,
    isFetching:
      countRead.isFetching ||
      fractionAddressReads.isFetching ||
      fractionCoreReads.isFetching ||
      ledgerBalanceReads.isFetching ||
      tokenAddressReads.isFetching ||
      tokenMetaReads.isFetching,
    error,
    refresh,
  };
}

export function useEarnProductDetails(product: EarnProduct, enabled: boolean) {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const veNftManager = getContractConfig(chainId, "MezoVeNFTManager");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;
  const veBtc = getContractConfig(chainId, "VeBTC");
  const veMezo = getContractConfig(chainId, "VeMEZO");

  const supportedVeNftAbiByAddress = useMemo(() => {
    const entries: Array<readonly [string, Abi]> = [];
    if (veBtc?.address) entries.push([veBtc.address.toLowerCase(), veBtc.abi]);
    if (veMezo?.address) entries.push([veMezo.address.toLowerCase(), veMezo.abi]);
    return new Map<string, Abi>(entries);
  }, [veBtc, veMezo]);

  const detailReads = useReadContracts({
    allowFailure: true,
    contracts:
      assetFractionAbi && product.fractionAddress !== ZERO_ADDRESS
        ? [
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "lifecycle",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "totalSupply",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "isTargetSettlementWindow",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "isRolloverAvailable",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "targetEpochEnd",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "trancheDuration",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "trancheLengthEpochs",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "rewardAsset",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "rewardReserve",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "settledUnderlying",
              chainId,
            },
            {
              address: product.fractionAddress,
              abi: assetFractionAbi,
              functionName: "decimals",
              chainId,
            },
            ...(userAddress
              ? [
                  {
                    address: product.fractionAddress,
                    abi: assetFractionAbi,
                    functionName: "claimableRewards",
                    args: [userAddress],
                    chainId,
                  },
                  {
                    address: product.fractionAddress,
                    abi: assetFractionAbi,
                    functionName: "availableBalanceOf",
                    args: [userAddress],
                    chainId,
                  },
                ]
              : []),
          ]
        : [],
    query: {
      enabled: enabled && Boolean(assetFractionAbi) && product.fractionAddress !== ZERO_ADDRESS,
      ...detailReadQueryOptions,
    },
  });

  const rewardAsset = asAddress(detailReads.data?.[7]?.result);
  const rewardTokenReads = useReadContracts({
    allowFailure: true,
    contracts: rewardAsset
      ? [
          { address: rewardAsset, abi: erc20Abi, functionName: "symbol", chainId },
          { address: rewardAsset, abi: erc20Abi, functionName: "decimals", chainId },
        ]
      : [],
    query: {
      enabled: enabled && Boolean(rewardAsset),
      ...staticReadQueryOptions,
    },
  });

  const effectiveVeNftManagerAddress = veNftManager?.address ?? null;

  const heldTokenIdReads = useReadContracts({
    allowFailure: true,
    contracts:
      effectiveVeNftManagerAddress && veNftManager?.abi && product.veNFT
        ? [
            {
              address: effectiveVeNftManagerAddress,
              abi: veNftManager.abi,
              functionName: "getHeldTokenIds",
              args: [product.fractionAddress, product.veNFT],
              chainId,
            },
          ]
        : [],
    query: {
      enabled:
        enabled && Boolean(effectiveVeNftManagerAddress && veNftManager?.abi && product.veNFT),
      ...detailReadQueryOptions,
    },
  });

  const heldTokenIds = useMemo(
    () =>
      Array.isArray(heldTokenIdReads.data?.[0]?.result)
        ? heldTokenIdReads.data[0].result.filter(
            (tokenId): tokenId is bigint => typeof tokenId === "bigint",
          )
        : [],
    [heldTokenIdReads.data],
  );

  const heldPositionReads = useReadContracts({
    allowFailure: true,
    contracts:
      effectiveVeNftManagerAddress && veNftManager?.abi && product.veNFT
        ? heldTokenIds.map((tokenId) => ({
            address: effectiveVeNftManagerAddress,
            abi: veNftManager.abi,
            functionName: "getPosition",
            args: [product.veNFT!, tokenId],
            chainId,
          }))
        : [],
    query: {
      enabled:
        enabled &&
        Boolean(effectiveVeNftManagerAddress && veNftManager?.abi && product.veNFT) &&
        heldTokenIds.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const veNftAbi = product.veNFT
    ? supportedVeNftAbiByAddress.get(product.veNFT.toLowerCase())
    : null;
  const heldLockReads = useReadContracts({
    allowFailure: true,
    contracts:
      product.veNFT && veNftAbi
        ? heldTokenIds.map((tokenId) => ({
            address: product.veNFT!,
            abi: veNftAbi,
            functionName: "locked",
            args: [tokenId],
            chainId,
          }))
        : [],
    query: {
      enabled: enabled && Boolean(product.veNFT && veNftAbi) && heldTokenIds.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const [aprBasis, setAprBasis] = useState<AprBasis | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAprBasis() {
      if (
        !enabled ||
        !publicClient ||
        !assetLedger?.address ||
        !assetFractionAbi ||
        product.fractionAddress === ZERO_ADDRESS
      ) {
        setAprBasis(null);
        return;
      }

      const latestFundings = await scanRewardsFundedEvents({
        publicClient,
        chainId,
        assetLedgerAddress: assetLedger.address,
        assetLedgerDeploymentBlock: BigInt(assetLedger.deploymentBlock ?? 0),
        addresses: [product.fractionAddress],
      });

      const latestFunding = latestFundings.get(product.fractionAddress.toLowerCase());
      if (!latestFunding) {
        if (!cancelled) setAprBasis(null);
        return;
      }

      const supplyBlockNumber =
        latestFunding.blockNumber > 0n ? latestFunding.blockNumber - 1n : latestFunding.blockNumber;
      const totalSupplyAtFundingRaw = await readTotalSupplyAtBlock({
        publicClient,
        chainId,
        address: product.fractionAddress,
        assetFractionAbi,
        blockNumber: supplyBlockNumber,
      });

      if (!cancelled) {
        setAprBasis(
          totalSupplyAtFundingRaw
            ? {
                rewardAmountRaw: latestFunding.amount,
                totalSupplyAtFundingRaw,
                fundingBlockNumber: latestFunding.blockNumber,
              }
            : null,
        );
      }
    }

    void loadAprBasis();

    return () => {
      cancelled = true;
    };
  }, [
    assetFractionAbi,
    assetLedger?.address,
    assetLedger?.deploymentBlock,
    chainId,
    enabled,
    product.fractionAddress,
    publicClient,
  ]);

  const refundablePositions = useMemo<EarnRefundablePosition[]>(() => {
    if (!product.veNFT) return [];

    return heldTokenIds
      .map((tokenId, index) => {
        const position = heldPositionReads.data?.[index]?.result;
        if (!Array.isArray(position)) return null;

        const lockedAmountRaw = asBigint(position[0]);
        const trancheId = asBigint(position[1]);
        const fraction = asAddress(position[2]);
        const lock = heldLockReads.data?.[index]?.result;
        const unlockTime = Array.isArray(lock) ? asBigint(lock[1]) : null;

        if (
          !lockedAmountRaw ||
          !trancheId ||
          !sameAddress(fraction, product.fractionAddress) ||
          trancheId !== product.trancheId
        ) {
          return null;
        }

        return {
          key: `${product.veNFT}-${tokenId.toString()}`,
          veNft: product.veNFT!,
          tokenId,
          lockedAmountRaw,
          unlockTime,
        };
      })
      .filter((position): position is EarnRefundablePosition => Boolean(position));
  }, [
    heldLockReads.data,
    heldPositionReads.data,
    heldTokenIds,
    product.fractionAddress,
    product.trancheId,
    product.veNFT,
  ]);

  const rewardSymbol = rewardTokenReads.data?.[0]?.result;
  const rewardDecimals = rewardTokenReads.data?.[1]?.result;

  const hydratedProduct = useMemo<EarnProduct>(() => {
    if (!enabled) return product;

    return {
      ...product,
      lifecycle: asNumber(detailReads.data?.[0]?.result),
      totalSupplyRaw: asBigint(detailReads.data?.[1]?.result),
      isTargetSettlementWindow: asBoolean(detailReads.data?.[2]?.result),
      isRolloverAvailable: asBoolean(detailReads.data?.[3]?.result),
      targetEpochEnd: asBigint(detailReads.data?.[4]?.result),
      trancheDuration: asBigint(detailReads.data?.[5]?.result),
      trancheLengthEpochs: asBigint(detailReads.data?.[6]?.result),
      rewardAsset,
      rewardSymbol: typeof rewardSymbol === "string" && rewardSymbol.trim() ? rewardSymbol : null,
      rewardDecimals: asNumber(rewardDecimals) ?? 18,
      rewardReserveRaw: asBigint(detailReads.data?.[8]?.result),
      settledUnderlyingRaw: asBigint(detailReads.data?.[9]?.result),
      decimals: asNumber(detailReads.data?.[10]?.result) ?? product.decimals,
      claimableRewardsRaw: asBigint(detailReads.data?.[11]?.result) ?? 0n,
      userAvailableBalanceRaw:
        asBigint(detailReads.data?.[12]?.result) ?? product.userAvailableBalanceRaw,
      aprRewardAmountRaw: aprBasis?.rewardAmountRaw ?? null,
      aprTotalSupplyAtFundingRaw: aprBasis?.totalSupplyAtFundingRaw ?? null,
      aprFundingBlockNumber: aprBasis?.fundingBlockNumber ?? null,
      refundablePositions,
    };
  }, [
    aprBasis,
    detailReads.data,
    enabled,
    product,
    refundablePositions,
    rewardAsset,
    rewardDecimals,
    rewardSymbol,
  ]);

  return {
    product: hydratedProduct,
    isLoading:
      enabled &&
      (detailReads.isLoading ||
        rewardTokenReads.isLoading ||
        heldTokenIdReads.isLoading ||
        heldPositionReads.isLoading ||
        heldLockReads.isLoading),
    isFetching:
      enabled &&
      (detailReads.isFetching ||
        rewardTokenReads.isFetching ||
        heldTokenIdReads.isFetching ||
        heldPositionReads.isFetching ||
        heldLockReads.isFetching),
    error:
      (detailReads.error as Error | null) ||
      (rewardTokenReads.error as Error | null) ||
      (heldTokenIdReads.error as Error | null) ||
      (heldPositionReads.error as Error | null) ||
      (heldLockReads.error as Error | null) ||
      null,
    refresh() {
      void detailReads.refetch();
      void rewardTokenReads.refetch();
      void heldTokenIdReads.refetch();
      void heldPositionReads.refetch();
      void heldLockReads.refetch();
    },
  };
}
