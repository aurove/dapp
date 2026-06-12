"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, parseAbiItem, type Abi, type Address, type PublicClient } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { useKnownMezoTokenBalance } from "@/components/shared/use-known-mezo-token-balance";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import {
  readAddress,
  readBigint,
  readBoolean,
  readNumber,
  readResult,
  sameAddress,
} from "@/lib/web3/value-parsers";
import { findLatestEventLogByChunks, type CachedEventLog } from "@/lib/web3/event-cache";
import { decodeTrancheId } from "@/components/features/trade/utils/tranche";

export type EarnVariant = "veBTC" | "veMEZO";

export type EarnTokenInfo = {
  veNftAddress: Address;
  underlyingAddress: Address | null;
  symbol: string;
  decimals: number;
  balanceRaw: bigint;
  allowanceRaw: bigint;
};

export type EarnRefundablePosition = {
  key: string;
  veNft: Address;
  tokenId: bigint;
  lockedAmountRaw: bigint;
  unlockTime: bigint | null;
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
  refundablePositions: EarnRefundablePosition[];
};

export type EarnAprBasisMap = Record<
  string,
  {
    rewardAmountRaw: bigint;
    totalSupplyAtFundingRaw: bigint;
    fundingBlockNumber: bigint;
  } | null
>;

type FractionCore = {
  address: Address;
  symbol: string;
  name: string;
  trancheId: bigint;
  veNFT: Address | null;
  decoded: ReturnType<typeof decodeTrancheId>;
};

type EarnSnapshot = {
  products: EarnProduct[];
  liveProductCount: number;
  userPositions: EarnProduct[];
  tokens: Record<EarnVariant, EarnTokenInfo | null>;
  supportedVeNfts: Array<{
    variant: EarnVariant;
    veNftAddress: Address;
    abi: Abi;
  }>;
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

const EARN_APR_QUERY_PREFIX = "earn-apr-basis";
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

const TRANCHE_META_READS = 4;
const PRODUCT_STATIC_READS = 9;
const PRODUCT_ACCOUNT_READS = 3;
const TOKEN_META_READS = 2;
const POSITION_READS = 2;

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

function isNewerFundingEvent(next: FundingEventSnapshot, current?: FundingEventSnapshot) {
  if (!current) return true;
  if (next.blockNumber !== current.blockNumber) return next.blockNumber > current.blockNumber;
  return next.logIndex > current.logIndex;
}

function inferVariantFromSymbol(symbol: string): EarnVariant | null {
  const normalized = symbol.toLowerCase();
  if (normalized.startsWith("fvebtc")) return "veBTC";
  if (normalized.startsWith("fvemezo")) return "veMEZO";
  return null;
}

function emptyProductCore(fraction: FractionCore, userBalanceRaw = 0n): EarnProduct {
  const decoded = fraction.decoded;
  const variant = decoded?.variant ?? inferVariantFromSymbol(fraction.symbol) ?? "veMEZO";

  return {
    id: `${fraction.address}-${fraction.trancheId.toString()}`,
    fractionAddress: fraction.address,
    trancheId: fraction.trancheId,
    trancheNumber: decoded?.trancheNumber ?? Number(fraction.trancheId & 0xffffn),
    variant,
    name: fraction.name,
    symbol: fraction.symbol,
    veNFT: fraction.veNFT,
    decimals: 18,
    totalSupplyRaw: null,
    userBalanceRaw,
    claimableRewardsRaw: 0n,
    userAvailableBalanceRaw: userBalanceRaw,
    rewardAsset: null,
    rewardSymbol: variant === "veBTC" ? "BTC" : "MEZO",
    rewardDecimals: 18,
    rewardReserveRaw: null,
    aprRewardAmountRaw: null,
    aprTotalSupplyAtFundingRaw: null,
    aprFundingBlockNumber: null,
    settledUnderlyingRaw: null,
    targetEpochEnd: null,
    trancheDuration: null,
    trancheLengthEpochs: decoded?.trancheNumber ? BigInt(decoded.trancheNumber) : null,
    isTargetSettlementWindow: false,
    refundablePositions: [],
  };
}

function earnAprBasisQueryKey(params: {
  chainId: number;
  assetLedgerAddress: Address | null | undefined;
  productAddresses: Address[];
}) {
  return [
    EARN_APR_QUERY_PREFIX,
    params.chainId,
    params.assetLedgerAddress?.toLowerCase() ?? null,
    [...new Set(params.productAddresses.map((address) => address.toLowerCase()))].sort(),
  ] as const;
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
          const amount = readBigint(log.args.amount) ?? 0n;
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
    .then(readBigint)
    .catch(() => null);

  totalSupplyAtBlockCache.set(cacheKey, promise);
  return promise;
}

function readErc20Metadata(reads: Array<{ result?: unknown }> | undefined, index: number) {
  const symbolResult = readResult<string>(reads, index * TOKEN_META_READS);
  const decimalsResult = readResult<bigint | number>(reads, index * TOKEN_META_READS + 1);

  return {
    symbol: typeof symbolResult === "string" && symbolResult.trim() ? symbolResult.trim() : null,
    decimals: readNumber(decimalsResult) ?? 18,
  };
}

function parsePositionValue(result: unknown) {
  if (!result) return null;

  if (Array.isArray(result)) {
    return {
      lockedAmountRaw: readBigint(result[0]) ?? 0n,
      trancheId: readBigint(result[1]) ?? 0n,
      fraction: readAddress(result[2]),
    };
  }

  if (typeof result === "object") {
    const payload = result as {
      lockedAmount?: unknown;
      trancheId?: unknown;
      fraction?: unknown;
    };

    return {
      lockedAmountRaw: readBigint(payload.lockedAmount) ?? 0n,
      trancheId: readBigint(payload.trancheId) ?? 0n,
      fraction: readAddress(payload.fraction),
    };
  }

  return null;
}

function parseLockedValue(result: unknown) {
  if (!result) return { end: null, isPermanent: false };

  if (Array.isArray(result)) {
    return {
      end: readBigint(result[1]) ?? null,
      isPermanent: Boolean(result[2]),
    };
  }

  if (typeof result === "object") {
    const payload = result as { end?: unknown; isPermanent?: unknown };
    return {
      end: readBigint(payload.end) ?? null,
      isPermanent: Boolean(payload.isPermanent),
    };
  }

  return { end: null, isPermanent: false };
}

function parseHeldTokenIds(result: unknown) {
  if (!Array.isArray(result)) return [] as bigint[];
  return result.filter((tokenId): tokenId is bigint => typeof tokenId === "bigint");
}

function parseFractionMeta(
  fractionAddress: Address,
  reads: Array<{ result?: unknown }> | undefined,
  index: number,
): FractionCore {
  const cursor = index * TRANCHE_META_READS;
  const symbolResult = readResult<string>(reads, cursor);
  const nameResult = readResult<string>(reads, cursor + 1);
  const trancheResult = readResult<bigint>(reads, cursor + 2);
  const veNftResult = readResult<string>(reads, cursor + 3);
  const trancheId = readBigint(trancheResult) ?? 0n;
  const decoded = decodeTrancheId(trancheId);

  return {
    address: fractionAddress,
    symbol:
      typeof symbolResult === "string" && symbolResult.trim().length > 0
        ? symbolResult.trim()
        : `${fractionAddress.slice(0, 6)}...${fractionAddress.slice(-4)}`,
    name:
      typeof nameResult === "string" && nameResult.trim().length > 0
        ? nameResult.trim()
        : "Earn claim",
    trancheId,
    veNFT: readAddress(veNftResult),
    decoded,
  };
}

function buildRewardMetaMap(reads: Array<{ result?: unknown }> | undefined, addresses: Address[]) {
  const map = new Map<string, { symbol: string | null; decimals: number }>();

  addresses.forEach((address, index) => {
    const cursor = index * TOKEN_META_READS;
    const symbolResult = readResult<string>(reads, cursor);
    const decimalsResult = readResult<bigint | number>(reads, cursor + 1);
    map.set(address.toLowerCase(), {
      symbol:
        typeof symbolResult === "string" && symbolResult.trim().length > 0
          ? symbolResult.trim()
          : null,
      decimals: readNumber(decimalsResult) ?? 18,
    });
  });

  return map;
}

function buildTokenInfoMap(params: {
  veNftAddress: Address;
  underlyingAddress: Address | null;
  meta: { symbol: string | null; decimals: number };
  balanceRaw: bigint;
  allowanceRaw: bigint;
  fallbackSymbol: string;
}) {
  return {
    veNftAddress: params.veNftAddress,
    underlyingAddress: params.underlyingAddress,
    symbol: params.meta.symbol ?? params.fallbackSymbol,
    decimals: params.meta.decimals,
    balanceRaw: params.underlyingAddress ? params.balanceRaw : 0n,
    allowanceRaw: params.underlyingAddress ? params.allowanceRaw : 0n,
  } satisfies EarnTokenInfo;
}

export function useEarnSnapshot() {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;

  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;
  const veBtc = getContractConfig(chainId, "VeBTC");
  const veMezo = getContractConfig(chainId, "VeMEZO");

  const supportedVeNfts = useMemo(
    () =>
      [
        veBtc?.address && veBtc.abi
          ? ({
              variant: "veBTC",
              veNftAddress: veBtc.address,
              abi: veBtc.abi,
            } as const)
          : null,
        veMezo?.address && veMezo.abi
          ? ({
              variant: "veMEZO",
              veNftAddress: veMezo.address,
              abi: veMezo.abi,
            } as const)
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [veBtc, veMezo],
  );

  const canReadLedger = Boolean(assetLedger?.address && assetLedger.abi && assetFractionAbi);

  const ledgerContracts = useMemo(() => {
    if (!canReadLedger) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      chainId: number;
    }> = [
      {
        address: assetLedger!.address,
        abi: assetLedger!.abi,
        functionName: "assetFractionCount",
        chainId,
      },
    ];

    if (veBtc?.address && veBtc.abi) {
      contracts.push({
        address: veBtc.address,
        abi: veBtc.abi,
        functionName: "token",
        chainId,
      });
    }

    if (veMezo?.address && veMezo.abi) {
      contracts.push({
        address: veMezo.address,
        abi: veMezo.abi,
        functionName: "token",
        chainId,
      });
    }

    return contracts;
  }, [assetLedger, canReadLedger, chainId, veBtc, veMezo]);

  const ledgerReads = useReadContracts({
    allowFailure: true,
    contracts: ledgerContracts,
    query: {
      enabled: ledgerContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const fractionCount = useMemo(() => {
    const result = ledgerReads.data?.[0]?.result;
    return typeof result === "bigint" ? Number(result) : 0;
  }, [ledgerReads.data]);

  const veBtcUnderlyingAddress = readAddress(ledgerReads.data?.[1]?.result);
  const veMezoUnderlyingAddress = readAddress(ledgerReads.data?.[veBtc?.address ? 2 : 1]?.result);

  const fractionAddressContracts = useMemo(() => {
    if (!canReadLedger || fractionCount === 0) return [];

    return Array.from({ length: fractionCount }, (_, index) => ({
      address: assetLedger!.address,
      abi: assetLedger!.abi,
      functionName: "assetFractionAt",
      args: [BigInt(index)],
      chainId,
    }));
  }, [assetLedger, canReadLedger, chainId, fractionCount]);

  const fractionAddressReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddressContracts,
    query: {
      enabled: fractionAddressContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const fractionAddresses = useMemo(
    () =>
      (fractionAddressReads.data ?? [])
        .map((entry) => readAddress(entry.result))
        .filter((address): address is Address => Boolean(address)),
    [fractionAddressReads.data],
  );

  const fractionMetaContracts = useMemo(() => {
    if (fractionAddresses.length === 0 || !assetFractionAbi) return [];

    return fractionAddresses.flatMap((fractionAddress) => [
      {
        address: fractionAddress,
        abi: erc20Abi,
        functionName: "symbol",
        chainId,
      },
      {
        address: fractionAddress,
        abi: erc20Abi,
        functionName: "name",
        chainId,
      },
      {
        address: fractionAddress,
        abi: assetFractionAbi,
        functionName: "trancheId",
        chainId,
      },
      {
        address: fractionAddress,
        abi: assetFractionAbi,
        functionName: "veNFT",
        chainId,
      },
    ]);
  }, [assetFractionAbi, chainId, fractionAddresses]);

  const fractionMetaReads = useReadContracts({
    allowFailure: true,
    contracts: fractionMetaContracts,
    query: {
      enabled: fractionMetaContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const fractionCore = useMemo<FractionCore[]>(
    () =>
      fractionAddresses.map((address, index) =>
        parseFractionMeta(address, fractionMetaReads.data, index),
      ),
    [fractionAddresses, fractionMetaReads.data],
  );

  const productsFromFractions = useMemo(
    () =>
      fractionCore
        .map((fraction) => {
          const variant =
            fraction.decoded?.variant ??
            (sameAddress(fraction.veNFT, veBtc?.address)
              ? "veBTC"
              : sameAddress(fraction.veNFT, veMezo?.address)
                ? "veMEZO"
                : inferVariantFromSymbol(fraction.symbol));

          if (!variant) return null;

          const decoded = fraction.decoded ?? {
            variant,
            trancheNumber: Number(fraction.trancheId & 0xffffn),
          };

          return emptyProductCore({ ...fraction, decoded: { ...decoded, variant } });
        })
        .filter((product): product is EarnProduct => Boolean(product))
        .sort((a, b) => a.variant.localeCompare(b.variant) || a.trancheNumber - b.trancheNumber),
    [fractionCore, veBtc?.address, veMezo?.address],
  );

  const productStaticContracts = useMemo(() => {
    if (!canReadLedger || productsFromFractions.length === 0 || !assetFractionAbi) return [];

    return productsFromFractions.flatMap((product) => [
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
    ]);
  }, [assetFractionAbi, canReadLedger, chainId, productsFromFractions]);

  const productStaticReads = useReadContracts({
    allowFailure: true,
    contracts: productStaticContracts,
    query: {
      enabled: productStaticContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const productAccountContracts = useMemo(() => {
    if (!canReadLedger || !userAddress || productsFromFractions.length === 0 || !assetFractionAbi) {
      return [];
    }

    return productsFromFractions.flatMap((product) => [
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
      {
        address: assetLedger!.address,
        abi: assetLedger!.abi,
        functionName: "balanceOf",
        args: [userAddress, product.trancheId],
        chainId,
      },
    ]);
  }, [assetFractionAbi, assetLedger, canReadLedger, chainId, productsFromFractions, userAddress]);

  const productAccountReads = useReadContracts({
    allowFailure: true,
    contracts: productAccountContracts,
    query: {
      enabled: productAccountContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const rewardAssetAddresses = useMemo(() => {
    const values = new Map<string, Address>();

    productsFromFractions.forEach((product, index) => {
      const rewardAsset = readAddress(
        readResult<unknown>(productStaticReads.data, index * PRODUCT_STATIC_READS + 5),
      );
      if (rewardAsset) {
        values.set(rewardAsset.toLowerCase(), rewardAsset);
      }
    });

    return [...values.values()];
  }, [productStaticReads.data, productsFromFractions]);

  const rewardMetadataContracts = useMemo(() => {
    if (rewardAssetAddresses.length === 0) return [];

    return rewardAssetAddresses.flatMap((address) => [
      {
        address,
        abi: erc20Abi,
        functionName: "symbol",
        chainId,
      },
      {
        address,
        abi: erc20Abi,
        functionName: "decimals",
        chainId,
      },
    ]);
  }, [chainId, rewardAssetAddresses]);

  const rewardMetadataReads = useReadContracts({
    allowFailure: true,
    contracts: rewardMetadataContracts,
    query: {
      enabled: rewardMetadataContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const veTokenMetaContracts = useMemo(() => {
    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: "symbol" | "decimals";
      chainId: number;
    }> = [];

    if (veBtcUnderlyingAddress) {
      contracts.push(
        {
          address: veBtcUnderlyingAddress,
          abi: erc20Abi,
          functionName: "symbol",
          chainId,
        },
        {
          address: veBtcUnderlyingAddress,
          abi: erc20Abi,
          functionName: "decimals",
          chainId,
        },
      );
    }

    if (veMezoUnderlyingAddress) {
      contracts.push(
        {
          address: veMezoUnderlyingAddress,
          abi: erc20Abi,
          functionName: "symbol",
          chainId,
        },
        {
          address: veMezoUnderlyingAddress,
          abi: erc20Abi,
          functionName: "decimals",
          chainId,
        },
      );
    }

    return contracts;
  }, [chainId, veBtcUnderlyingAddress, veMezoUnderlyingAddress]);

  const veTokenMetaReads = useReadContracts({
    allowFailure: true,
    contracts: veTokenMetaContracts,
    query: {
      enabled: veTokenMetaContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const veBtcTokenBalance = useKnownMezoTokenBalance({
    ownerAddress: userAddress,
    tokenAddress: veBtcUnderlyingAddress,
    tokenSymbol: "BTC",
    spenderAddress: assetLedger?.address,
    chainId,
  });
  const veMezoTokenBalance = useKnownMezoTokenBalance({
    ownerAddress: userAddress,
    tokenAddress: veMezoUnderlyingAddress,
    tokenSymbol: "MEZO",
    spenderAddress: assetLedger?.address,
    chainId,
  });

  const tokens = useMemo<Record<EarnVariant, EarnTokenInfo | null>>(() => {
    const metaByUnderlying = new Map<string, { symbol: string | null; decimals: number }>();

    if (veBtcUnderlyingAddress) {
      metaByUnderlying.set(
        veBtcUnderlyingAddress.toLowerCase(),
        readErc20Metadata(veTokenMetaReads.data, 0),
      );
    }
    if (veMezoUnderlyingAddress) {
      const offset = veBtcUnderlyingAddress ? TOKEN_META_READS : 0;
      metaByUnderlying.set(
        veMezoUnderlyingAddress.toLowerCase(),
        readErc20Metadata(veTokenMetaReads.data, offset / TOKEN_META_READS),
      );
    }

    const veBtcToken =
      veBtc?.address && veBtcUnderlyingAddress
        ? buildTokenInfoMap({
            veNftAddress: veBtc.address,
            underlyingAddress: veBtcUnderlyingAddress,
            meta: metaByUnderlying.get(veBtcUnderlyingAddress.toLowerCase()) ?? {
              symbol: "BTC",
              decimals: 18,
            },
            fallbackSymbol: "BTC",
            balanceRaw: veBtcTokenBalance.balanceRaw,
            allowanceRaw: veBtcTokenBalance.allowanceRaw,
          })
        : null;

    const veMezoToken =
      veMezo?.address && veMezoUnderlyingAddress
        ? buildTokenInfoMap({
            veNftAddress: veMezo.address,
            underlyingAddress: veMezoUnderlyingAddress,
            meta: metaByUnderlying.get(veMezoUnderlyingAddress.toLowerCase()) ?? {
              symbol: "MEZO",
              decimals: 18,
            },
            fallbackSymbol: "MEZO",
            balanceRaw: veMezoTokenBalance.balanceRaw,
            allowanceRaw: veMezoTokenBalance.allowanceRaw,
          })
        : null;

    return {
      veBTC: veBtcToken,
      veMEZO: veMezoToken,
    };
  }, [
    veBtc,
    veBtcUnderlyingAddress,
    veBtcTokenBalance.allowanceRaw,
    veBtcTokenBalance.balanceRaw,
    veMezo,
    veMezoUnderlyingAddress,
    veMezoTokenBalance.allowanceRaw,
    veMezoTokenBalance.balanceRaw,
    veTokenMetaReads.data,
  ]);

  const products = useMemo<EarnProduct[]>(() => {
    const rewardMetaByAddress = buildRewardMetaMap(rewardMetadataReads.data, rewardAssetAddresses);

    return productsFromFractions.map((product, index) => {
      const staticCursor = index * PRODUCT_STATIC_READS;
      const accountCursor = index * PRODUCT_ACCOUNT_READS;

      const totalSupply = readBigint(readResult<unknown>(productStaticReads.data, staticCursor));
      const isTargetSettlementWindow = readBoolean(
        readResult<unknown>(productStaticReads.data, staticCursor + 1),
      );
      const targetEpochEnd = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 2),
      );
      const trancheDuration = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 3),
      );
      const trancheLengthEpochs = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 4),
      );
      const rewardAsset = readAddress(
        readResult<unknown>(productStaticReads.data, staticCursor + 5),
      );
      const rewardReserveRaw = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 6),
      );
      const settledUnderlyingRaw = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 7),
      );
      const decimals =
        readNumber(readResult<unknown>(productStaticReads.data, staticCursor + 8)) ?? 18;

      const claimableRewardsRaw =
        readBigint(readResult<unknown>(productAccountReads.data, accountCursor)) ?? 0n;
      const userAvailableBalanceRaw =
        readBigint(readResult<unknown>(productAccountReads.data, accountCursor + 1)) ?? 0n;
      const userBalanceRaw =
        readBigint(readResult<unknown>(productAccountReads.data, accountCursor + 2)) ?? 0n;

      const rewardMeta = rewardAsset
        ? rewardMetaByAddress.get(rewardAsset.toLowerCase())
        : undefined;

      return {
        ...product,
        totalSupplyRaw: totalSupply,
        isTargetSettlementWindow,
        targetEpochEnd,
        trancheDuration,
        trancheLengthEpochs,
        rewardAsset,
        rewardSymbol: rewardMeta?.symbol ?? (product.variant === "veBTC" ? "BTC" : "MEZO"),
        rewardDecimals: rewardMeta?.decimals ?? 18,
        rewardReserveRaw,
        settledUnderlyingRaw,
        decimals,
        claimableRewardsRaw,
        userAvailableBalanceRaw,
        userBalanceRaw,
        refundablePositions: [],
      };
    });
  }, [
    productAccountReads.data,
    productStaticReads.data,
    productsFromFractions,
    rewardAssetAddresses,
    rewardMetadataReads.data,
  ]);

  const snapshot = useMemo<EarnSnapshot>(() => {
    return {
      products,
      liveProductCount: products.length,
      userPositions: products.filter((product) => product.userBalanceRaw > 0n),
      tokens,
      supportedVeNfts,
    };
  }, [products, supportedVeNfts, tokens]);

  const isLoading =
    ledgerReads.isLoading ||
    fractionAddressReads.isLoading ||
    fractionMetaReads.isLoading ||
    productStaticReads.isLoading ||
    productAccountReads.isLoading ||
    rewardMetadataReads.isLoading ||
    veTokenMetaReads.isLoading ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking;

  const isFetching =
    ledgerReads.isFetching ||
    fractionAddressReads.isFetching ||
    fractionMetaReads.isFetching ||
    productStaticReads.isFetching ||
    productAccountReads.isFetching ||
    rewardMetadataReads.isFetching ||
    veTokenMetaReads.isFetching ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking;

  const error =
    (ledgerReads.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionMetaReads.error as Error | null) ||
    (productStaticReads.error as Error | null) ||
    (productAccountReads.error as Error | null) ||
    (rewardMetadataReads.error as Error | null) ||
    (veTokenMetaReads.error as Error | null) ||
    (veBtcTokenBalance.error as Error | null) ||
    (veMezoTokenBalance.error as Error | null) ||
    null;

  function refresh() {
    void Promise.all([
      ledgerReads.refetch(),
      fractionAddressReads.refetch(),
      fractionMetaReads.refetch(),
      productStaticReads.refetch(),
      productAccountReads.refetch(),
      rewardMetadataReads.refetch(),
      veTokenMetaReads.refetch(),
      veBtcTokenBalance.refresh(),
      veMezoTokenBalance.refresh(),
    ]);
    void queryClient.invalidateQueries({ queryKey: [EARN_APR_QUERY_PREFIX] });
  }

  return {
    chainId,
    assetLedger,
    assetFractionAbi,
    supportedVeNfts,
    products: snapshot.products,
    liveProductCount: snapshot.liveProductCount,
    userPositions: snapshot.userPositions,
    tokens: snapshot.tokens,
    isLoading,
    isFetching,
    error,
    refresh,
  };
}

export function useEarnProductDetails(
  product: EarnProduct,
  enabled: boolean,
  aprBasisMapOverride?: EarnAprBasisMap | null,
) {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const veNftManager = getContractConfig(chainId, "MezoVeNFTManager");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;
  const veNftAbi = getContractConfig(
    chainId,
    product.variant === "veBTC" ? "VeBTC" : "VeMEZO",
  )?.abi;

  const snapshot = useEarnSnapshot();

  const aprQuery = useAprBasis({
    enabled: enabled && !aprBasisMapOverride,
    products: [product],
    chainId,
    assetFractionAbi,
  });

  const aprBasisMap = useMemo<EarnAprBasisMap>(
    () => aprBasisMapOverride ?? aprQuery.data ?? {},
    [aprBasisMapOverride, aprQuery.data],
  );

  const detailsContracts = useMemo(() => {
    const veNftAddress = product.veNFT;

    if (!enabled || !userAddress || !veNftManager?.address || !veNftManager.abi || !veNftAddress) {
      return [] as Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }>;
    }

    return [
      {
        address: veNftManager.address,
        abi: veNftManager.abi,
        functionName: "getHeldTokenIds",
        args: [product.fractionAddress, veNftAddress],
        chainId,
      },
    ];
  }, [chainId, enabled, product.fractionAddress, product.veNFT, userAddress, veNftManager]);

  const detailsReads = useReadContracts({
    allowFailure: true,
    contracts: detailsContracts,
    query: {
      enabled: detailsContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const heldTokenIds = useMemo(() => {
    if (!product.veNFT || !detailsReads.data?.[0]) return [] as bigint[];
    return parseHeldTokenIds(detailsReads.data[0].result);
  }, [detailsReads.data, product.veNFT]);

  const positionContracts = useMemo(() => {
    const veNftAddress = product.veNFT;

    if (
      !enabled ||
      !veNftAddress ||
      !veNftAbi ||
      !veNftManager?.address ||
      !veNftManager.abi ||
      heldTokenIds.length === 0
    ) {
      return [] as Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }>;
    }

    return heldTokenIds.flatMap((tokenId) => [
      {
        address: veNftManager.address,
        abi: veNftManager.abi,
        functionName: "getPosition",
        args: [veNftAddress, tokenId],
        chainId,
      },
      {
        address: veNftAddress,
        abi: veNftAbi,
        functionName: "locked",
        args: [tokenId],
        chainId,
      },
    ]);
  }, [chainId, enabled, heldTokenIds, product.veNFT, veNftAbi, veNftManager]);

  const positionReads = useReadContracts({
    allowFailure: true,
    contracts: positionContracts,
    query: {
      enabled: positionContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const refundablePositions = useMemo<EarnRefundablePosition[]>(() => {
    if (!product.veNFT || heldTokenIds.length === 0) return [];

    const positions: EarnRefundablePosition[] = [];

    for (let index = 0; index < heldTokenIds.length; index += 1) {
      const tokenId = heldTokenIds[index]!;
      const positionResult = positionReads.data?.[index * POSITION_READS]?.result;
      const lockResult = positionReads.data?.[index * POSITION_READS + 1]?.result;
      const position = parsePositionValue(positionResult);
      const lock = parseLockedValue(lockResult);

      if (
        !position ||
        position.lockedAmountRaw <= 0n ||
        !position.trancheId ||
        !sameAddress(position.fraction, product.fractionAddress) ||
        position.trancheId !== product.trancheId
      ) {
        continue;
      }

      positions.push({
        key: `${product.veNFT}-${tokenId.toString()}`,
        veNft: product.veNFT,
        tokenId,
        lockedAmountRaw: position.lockedAmountRaw,
        unlockTime: lock.end,
      });
    }

    return positions;
  }, [heldTokenIds, positionReads.data, product.fractionAddress, product.trancheId, product.veNFT]);

  const hydratedProduct = useMemo<EarnProduct>(() => {
    const baseProduct =
      snapshot.products.find(
        (entry) =>
          entry.fractionAddress.toLowerCase() === product.fractionAddress.toLowerCase() &&
          entry.trancheId === product.trancheId,
      ) ?? product;

    const aprBasis = aprBasisMap[baseProduct.fractionAddress.toLowerCase()];

    return {
      ...baseProduct,
      aprRewardAmountRaw: aprBasis?.rewardAmountRaw ?? null,
      aprTotalSupplyAtFundingRaw: aprBasis?.totalSupplyAtFundingRaw ?? null,
      aprFundingBlockNumber: aprBasis?.fundingBlockNumber ?? null,
      refundablePositions,
    };
  }, [aprBasisMap, product, refundablePositions, snapshot.products]);

  function refresh() {
    snapshot.refresh();
    void detailsReads.refetch();
    void positionReads.refetch();
    void queryClient.invalidateQueries({ queryKey: [EARN_APR_QUERY_PREFIX] });
  }

  return {
    product: hydratedProduct,
    isLoading:
      snapshot.isLoading || detailsReads.isLoading || positionReads.isLoading || aprQuery.isLoading,
    isFetching:
      snapshot.isFetching ||
      detailsReads.isFetching ||
      positionReads.isFetching ||
      aprQuery.isFetching,
    error:
      snapshot.error ||
      (detailsReads.error as Error | null) ||
      (positionReads.error as Error | null) ||
      (aprQuery.error as Error | null) ||
      null,
    refresh,
  };
}

async function fetchAprBasisMap(params: {
  products: EarnProduct[];
  chainId: number;
  publicClient: PublicClient;
}) {
  const { products, chainId, publicClient } = params;

  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;

  const validProducts = products.filter((product) => product.fractionAddress !== ZERO_ADDRESS);
  if (validProducts.length === 0 || !assetLedger?.address || !assetFractionAbi) return {};

  const addresses = [...new Set(validProducts.map((product) => product.fractionAddress))];

  const latestFundings = await scanRewardsFundedEvents({
    publicClient,
    chainId,
    assetLedgerAddress: assetLedger.address,
    assetLedgerDeploymentBlock: BigInt(assetLedger.deploymentBlock || 0),
    addresses,
  });

  const result: EarnAprBasisMap = {};

  await Promise.all(
    validProducts.map(async (product) => {
      const key = product.fractionAddress.toLowerCase();
      const latestFunding = latestFundings.get(key);

      if (!latestFunding) {
        result[key] = null;
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

      result[key] = totalSupplyAtFundingRaw
        ? {
            rewardAmountRaw: latestFunding.amount,
            totalSupplyAtFundingRaw,
            fundingBlockNumber: latestFunding.blockNumber,
          }
        : null;
    }),
  );

  return result;
}

export function useAprBasis(params: {
  enabled: boolean;
  products: EarnProduct[];
  chainId: number;
  assetFractionAbi: Abi | undefined;
}) {
  const { enabled, products, chainId, assetFractionAbi } = params;
  const publicClient = usePublicClient();
  const assetLedger = getContractConfig(chainId, "AssetLedger");

  const queryKey = earnAprBasisQueryKey({
    chainId,
    assetLedgerAddress: assetLedger?.address,
    productAddresses: products.map((product) => product.fractionAddress),
  });

  return useQuery({
    enabled:
      enabled &&
      Boolean(publicClient && assetLedger?.address && assetFractionAbi && products.length > 0),
    queryKey,
    queryFn: async () => {
      if (!publicClient) {
        return {};
      }

      return fetchAprBasisMap({
        products,
        chainId,
        publicClient,
      });
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
