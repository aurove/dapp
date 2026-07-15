"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAbiItem, type Abi, type Address, type PublicClient } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import { getEarnProtocolConfig, getRewardSinkAbi } from "@/contracts/earn";
import { useKnownMezoTokenBalance } from "@/components/shared/use-known-mezo-token-balance";
import { useErc20MetadataMap } from "@/lib/web3/use-erc20-metadata";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  detailReadQueryOptions,
  metadataReadQueryOptions,
  staticReadQueryOptions,
} from "@/lib/web3/read-query-options";
import {
  readAddress,
  readBigint,
  readBoolean,
  readNumber,
  readResult,
  sameAddress,
} from "@/lib/web3/value-parsers";
import { findLatestEventLogByChunks, type CachedEventLog } from "@/lib/web3/event-cache";
import {
  MAX_EPOCHS_BY_VARIANT,
  decodeTrancheId,
  deriveTrancheId,
  nameOf,
  symbolOf,
} from "@/components/features/earn/utils/tranche";

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
  apyRewardAmountRaw: bigint | null;
  apyTotalSupplyAtFundingRaw: bigint | null;
  apyFundingBlockNumber: bigint | null;
  settledUnderlyingRaw: bigint | null;
  rewardSinkAddress: Address | null;
  targetEpochEnd: bigint | null;
  trancheDuration: bigint | null;
  trancheLengthEpochs: bigint | null;
  isTargetSettlementWindow: boolean;
  refundablePositions: EarnRefundablePosition[];
};

export type EarnApyBasisMap = Record<
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
  variant: EarnVariant;
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

const EARN_APY_QUERY_PREFIX = "earn-apy-basis";
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

const PRODUCT_STATIC_READS = 9;
const PRODUCT_POSITION_READS = 2;
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
    apyRewardAmountRaw: null,
    apyTotalSupplyAtFundingRaw: null,
    apyFundingBlockNumber: null,
    settledUnderlyingRaw: null,
    rewardSinkAddress: null,
    targetEpochEnd: null,
    trancheDuration: null,
    trancheLengthEpochs: decoded?.trancheNumber ? BigInt(decoded.trancheNumber) : null,
    isTargetSettlementWindow: false,
    refundablePositions: [],
  };
}

function earnApyBasisQueryKey(params: {
  chainId: number;
  assetLedgerAddress: Address | null | undefined;
  productAddresses: Address[];
}) {
  return [
    EARN_APY_QUERY_PREFIX,
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

export function useEarnSnapshot() {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const rewardSinkAbi = useMemo(() => getRewardSinkAbi(chainId), [chainId]);
  const assetLedger = earnContracts.ledger;
  const assetFractionAbi = earnContracts.ledger?.abi;
  const vault = earnContracts.vault;
  const veBtc = earnContracts.veBtc;
  const veMezo = earnContracts.veMezo;

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

  const protocolContracts = useMemo(() => {
    if (!canReadLedger) return [];

    const contracts: Array<{
      address: Address;
      abi: Abi;
      functionName: string;
      args?: readonly unknown[];
      chainId: number;
    }> = [];

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
  }, [canReadLedger, chainId, veBtc, veMezo]);

  const protocolReads = useReadContracts({
    allowFailure: true,
    contracts: protocolContracts,
    query: {
      enabled: protocolContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const veBtcUnderlyingAddress = readAddress(veBtc?.address ? protocolReads.data?.[0]?.result : undefined);
  const veMezoUnderlyingAddress = readAddress(
    veMezo?.address ? protocolReads.data?.[veBtc?.address ? 1 : 0]?.result : undefined,
  );

  const managedTrancheCore = useMemo<FractionCore[]>(() => {
    if (!assetLedger?.address) return [];

    return supportedVeNfts
      .map((entry) => {
        const trancheNumber = MAX_EPOCHS_BY_VARIANT[entry.variant];
        const trancheId = deriveTrancheId(entry.variant, trancheNumber);
        return {
          address: assetLedger.address,
          symbol: symbolOf(entry.variant, trancheNumber),
          name: nameOf(entry.variant, trancheNumber),
          trancheId,
          variant: entry.variant,
          veNFT: entry.veNftAddress,
          decoded: { variant: entry.variant, trancheNumber },
        } satisfies FractionCore;
      })
      .sort((a, b) =>
        a.variant === b.variant ? Number(a.trancheId - b.trancheId) : a.variant.localeCompare(b.variant),
      );
  }, [assetLedger?.address, supportedVeNfts]);

  const productsFromFractions = useMemo(
    () =>
      managedTrancheCore
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
    [managedTrancheCore, veBtc?.address, veMezo?.address],
  );

  const rewardSinkContracts = useMemo(() => {
    if (!vault?.address || !vault.abi || productsFromFractions.length === 0) return [];

    return productsFromFractions.map((product) => ({
      address: vault.address,
      abi: vault.abi,
      functionName: "rewardSinkOfTranche",
      args: [product.trancheId],
      chainId,
    }));
  }, [chainId, productsFromFractions, vault]);

  const rewardSinkReads = useReadContracts({
    allowFailure: true,
    contracts: rewardSinkContracts,
    query: {
      enabled: rewardSinkContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const rewardSinkAddresses = useMemo(
    () => (rewardSinkReads.data ?? []).map((entry) => readAddress(entry.result)),
    [rewardSinkReads.data],
  );

  const claimableRewardsContracts = useMemo(() => {
    if (!userAddress || rewardSinkAddresses.length === 0 || !rewardSinkAbi) return [];

    return rewardSinkAddresses.map((rewardSinkAddress) => ({
      address: rewardSinkAddress ?? ZERO_ADDRESS,
      abi: rewardSinkAbi,
      functionName: "claimableRewards",
      args: [userAddress],
      chainId,
    }));
  }, [chainId, rewardSinkAbi, rewardSinkAddresses, userAddress]);

  const claimableRewardsReads = useReadContracts({
    allowFailure: true,
    contracts: claimableRewardsContracts,
    query: {
      enabled: claimableRewardsContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

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
        functionName: "redeemableBalanceOf",
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

  const rewardTokenMeta = useErc20MetadataMap({
    chainId,
    addresses: rewardAssetAddresses,
    enabled: rewardAssetAddresses.length > 0,
  });

  const veTokenMeta = useErc20MetadataMap({
    chainId,
    addresses: [veBtcUnderlyingAddress, veMezoUnderlyingAddress].filter(
      (address): address is Address => Boolean(address),
    ),
    enabled: Boolean(veBtcUnderlyingAddress || veMezoUnderlyingAddress),
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
    const veBtcToken =
      veBtc?.address && veBtcUnderlyingAddress
        ? {
            veNftAddress: veBtc.address,
            underlyingAddress: veBtcUnderlyingAddress,
            symbol:
              veTokenMeta.metadataByAddress[veBtcUnderlyingAddress.toLowerCase()]?.symbol ?? "BTC",
            decimals:
              veTokenMeta.metadataByAddress[veBtcUnderlyingAddress.toLowerCase()]?.decimals ?? 18,
            balanceRaw: veBtcTokenBalance.balanceRaw,
            allowanceRaw: veBtcTokenBalance.allowanceRaw,
          }
        : null;

    const veMezoToken =
      veMezo?.address && veMezoUnderlyingAddress
        ? {
            veNftAddress: veMezo.address,
            underlyingAddress: veMezoUnderlyingAddress,
            symbol:
              veTokenMeta.metadataByAddress[veMezoUnderlyingAddress.toLowerCase()]?.symbol ??
              "MEZO",
            decimals:
              veTokenMeta.metadataByAddress[veMezoUnderlyingAddress.toLowerCase()]?.decimals ??
              18,
            balanceRaw: veMezoTokenBalance.balanceRaw,
            allowanceRaw: veMezoTokenBalance.allowanceRaw,
          }
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
    veTokenMeta.metadataByAddress,
  ]);

  const products = useMemo<EarnProduct[]>(() => {
    return productsFromFractions.map((product, index) => {
      const staticCursor = index * PRODUCT_STATIC_READS;
      const accountCursor = index * PRODUCT_POSITION_READS;

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
        readBigint(readResult<unknown>(claimableRewardsReads.data, index)) ?? 0n;
      const userAvailableBalanceRaw =
        readBigint(readResult<unknown>(productAccountReads.data, accountCursor)) ?? 0n;
      const userBalanceRaw =
        readBigint(readResult<unknown>(productAccountReads.data, accountCursor + 1)) ?? 0n;
      const rewardSinkAddress = rewardSinkAddresses[index] ?? null;

      const rewardMeta = rewardAsset
        ? rewardTokenMeta.metadataByAddress[rewardAsset.toLowerCase()]
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
        rewardSinkAddress,
        decimals,
        claimableRewardsRaw,
        userAvailableBalanceRaw,
        userBalanceRaw,
        refundablePositions: [],
      };
    });
  }, [
    claimableRewardsReads.data,
    productAccountReads.data,
    productStaticReads.data,
    productsFromFractions,
    rewardSinkAddresses,
    rewardTokenMeta.metadataByAddress,
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
    protocolReads.isLoading ||
    productStaticReads.isLoading ||
    productAccountReads.isLoading ||
    rewardTokenMeta.isLoading ||
    veTokenMeta.isLoading ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking;

  const isFetching =
    protocolReads.isFetching ||
    productStaticReads.isFetching ||
    productAccountReads.isFetching ||
    rewardTokenMeta.isFetching ||
    veTokenMeta.isFetching ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking;

  const error =
    (protocolReads.error as Error | null) ||
    (productStaticReads.error as Error | null) ||
    (productAccountReads.error as Error | null) ||
    (rewardTokenMeta.error as Error | null) ||
    (veTokenMeta.error as Error | null) ||
    (veBtcTokenBalance.error as Error | null) ||
    (veMezoTokenBalance.error as Error | null) ||
    null;

  function refresh() {
    void Promise.all([
      protocolReads.refetch(),
      productStaticReads.refetch(),
      productAccountReads.refetch(),
      rewardTokenMeta.refresh(),
      veTokenMeta.refresh(),
      veBtcTokenBalance.refresh(),
      veMezoTokenBalance.refresh(),
    ]);
    void queryClient.invalidateQueries({ queryKey: [EARN_APY_QUERY_PREFIX] });
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
  apyBasisMapOverride?: EarnApyBasisMap | null,
) {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const assetFractionAbi = earnContracts.ledger?.abi as Abi | undefined;
  const veNftAbi =
    (product.variant === "veBTC" ? earnContracts.veBtc : earnContracts.veMezo)?.abi;

  const snapshot = useEarnSnapshot();

  const apyQuery = useApyBasis({
    enabled: enabled && !apyBasisMapOverride,
    products: [product],
    chainId,
    assetFractionAbi,
  });

  const apyBasisMap = useMemo<EarnApyBasisMap>(
    () => apyBasisMapOverride ?? apyQuery.data ?? {},
    [apyBasisMapOverride, apyQuery.data],
  );

  const detailsContracts = useMemo(() => {
    const veNftAddress = product.veNFT;

    if (!enabled || !userAddress || !veNftAddress || !veNftAbi) {
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
        address: veNftAddress,
        abi: veNftAbi,
        functionName: "getHeldTokenIds",
        args: [product.fractionAddress, veNftAddress],
        chainId,
      },
    ];
  }, [chainId, enabled, product.fractionAddress, product.veNFT, userAddress, veNftAbi]);

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
        address: veNftAddress,
        abi: veNftAbi,
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
  }, [chainId, enabled, heldTokenIds, product.veNFT, veNftAbi]);

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

    const apyBasis = apyBasisMap[baseProduct.fractionAddress.toLowerCase()];

    return {
      ...baseProduct,
      apyRewardAmountRaw: apyBasis?.rewardAmountRaw ?? null,
      apyTotalSupplyAtFundingRaw: apyBasis?.totalSupplyAtFundingRaw ?? null,
      apyFundingBlockNumber: apyBasis?.fundingBlockNumber ?? null,
      refundablePositions,
    };
  }, [apyBasisMap, product, refundablePositions, snapshot.products]);

  function refresh() {
    snapshot.refresh();
    void detailsReads.refetch();
    void positionReads.refetch();
    void queryClient.invalidateQueries({ queryKey: [EARN_APY_QUERY_PREFIX] });
  }

  return {
    product: hydratedProduct,
    isLoading:
      snapshot.isLoading || detailsReads.isLoading || positionReads.isLoading || apyQuery.isLoading,
    isFetching:
      snapshot.isFetching ||
      detailsReads.isFetching ||
      positionReads.isFetching ||
      apyQuery.isFetching,
    error:
      snapshot.error ||
      (detailsReads.error as Error | null) ||
      (positionReads.error as Error | null) ||
      (apyQuery.error as Error | null) ||
      null,
    refresh,
  };
}

async function fetchApyBasisMap(params: {
  products: EarnProduct[];
  chainId: number;
  publicClient: PublicClient;
}) {
  const { products, chainId, publicClient } = params;
  const assetLedger = getEarnProtocolConfig(chainId).ledger;
  const assetFractionAbi = assetLedger?.abi;

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

  const result: EarnApyBasisMap = {};

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

export function useApyBasis(params: {
  enabled: boolean;
  products: EarnProduct[];
  chainId: number;
  assetFractionAbi: Abi | undefined;
}) {
  const { enabled, products, chainId, assetFractionAbi } = params;
  const publicClient = usePublicClient();
  const assetLedger = getEarnProtocolConfig(chainId).ledger;

  const queryKey = earnApyBasisQueryKey({
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

      return fetchApyBasisMap({
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
