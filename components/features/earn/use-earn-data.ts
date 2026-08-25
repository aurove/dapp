"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAbiItem, type Abi, type Address, type PublicClient } from "viem";
import { useChainId, usePublicClient, useReadContracts } from "wagmi";
import { getEarnProtocolConfig } from "@/contracts/earn";
import { useKnownMezoTokenBalance } from "@/components/shared/use-known-mezo-token-balance";
import { useErc20MetadataMap } from "@/lib/web3/use-erc20-metadata";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  detailReadQueryOptions,
  staticReadQueryOptions,
} from "@/lib/web3/read-query-options";
import {
  readAddress,
  readBigint,
  readResult,
  sameAddress,
} from "@/lib/web3/value-parsers";
import { findLatestEventLogByChunks, type CachedEventLog } from "@/lib/web3/event-cache";
import { useId20Portfolio, useRewardsPortfolio, useTranchePortfolio } from "@/features/portfolio";
import {
  MAX_EPOCHS_BY_VARIANT,
  deriveTrancheId,
  nameOf,
  symbolOf,
} from "@/components/features/earn/utils/tranche";
import { selectEarnUserPositions } from "@/components/features/earn/earn-asset";
import { earnAprProductKey } from "@/components/features/earn/utils/apr";

export type EarnVariant = "veBTC" | "veMEZO";

export type EarnTokenInfo = {
  veNftAddress: Address;
  underlyingAddress: Address | null;
  symbol: string;
  decimals: number;
  balanceRaw: bigint;
};

/** Vault-held veNFT inventory that can satisfy a Ledger.redeem call. */
export type EarnRedeemInventory = {
  key: string;
  veNft: Address;
  tokenId: bigint;
  /**
   * Withdrawable free size after withdrawManaged (deposit weight + locked-managed
   * rewards). Used for display and BTC inventory capacity.
   */
  lockedAmountRaw: bigint;
  /**
   * Share-basis size for MEZO whole-NFT burn accounting (deposit weight only while
   * managed; equals lockedAmountRaw for free locks).
   */
  shareAmountRaw: bigint;
  unlockTime: bigint | null;
};

export type EarnProduct = {
  id: string;
  /** Ledger contract that mints/burns ERC1155 tranche shares. */
  ledgerAddress: Address;
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
  rewardSinkAddress: Address | null;
  redeemInventory: EarnRedeemInventory[];
  /** Liquid ID20 wrapper for this managed product (avBTCm / avMEZOm), if deployed. */
  id20Address: Address | null;
  /** Wallet ERC-20 balance of the ID20 wrapper. */
  id20BalanceRaw: bigint;
};

export type EarnAprBasisMap = Record<
  string,
  {
    rewardAmountRaw: bigint;
    totalSupplyAtFundingRaw: bigint;
    fundingBlockNumber: bigint;
  } | null
>;

type ManagedTrancheCore = {
  ledgerAddress: Address;
  symbol: string;
  name: string;
  trancheId: bigint;
  trancheNumber: number;
  variant: EarnVariant;
  veNFT: Address | null;
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
  checkedTipByAddress: Map<string, { blockNumber: bigint; blockHash: string }>;
  inFlight?: Promise<void>;
};

const EARN_APR_QUERY_PREFIX = "earn-apr-basis";
const REWARDS_FUNDED_SCAN_CHUNK_SIZE = 10_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const rewardsFundedEvent = parseAbiItem(
  "event RewardsFunded(address indexed funder,uint256 amount,uint256 distributedAmount,uint256 undistributedRewards,uint256 rewardReserve)",
);

const fundingScanCacheByChain = new Map<number, FundingScanCache>();
const totalSupplyAtBlockCache = new Map<string, Promise<bigint | null>>();

/** Per-product static multicall layout: totalSupply, rewardReserve. */
const PRODUCT_STATIC_READS = 2;
/** Per inventory tokenId: locked() then idToManaged(). */
const REDEEM_INVENTORY_META_READS = 2;

/** Mezo LockedManagedReward.earned(token, tokenId) — minimal surface for inventory sizing. */
const LOCKED_MANAGED_REWARD_ABI = [
  {
    type: "function",
    name: "earned",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;

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

function emptyProductCore(core: ManagedTrancheCore, userBalanceRaw = 0n): EarnProduct {
  return {
    id: `${core.ledgerAddress}-${core.trancheId.toString()}`,
    ledgerAddress: core.ledgerAddress,
    trancheId: core.trancheId,
    trancheNumber: core.trancheNumber,
    variant: core.variant,
    name: core.name,
    symbol: core.symbol,
    veNFT: core.veNFT,
    decimals: 18,
    totalSupplyRaw: null,
    userBalanceRaw,
    claimableRewardsRaw: 0n,
    userAvailableBalanceRaw: userBalanceRaw,
    rewardAsset: null,
    rewardSymbol: core.variant === "veBTC" ? "BTC" : "MEZO",
    rewardDecimals: 18,
    rewardReserveRaw: null,
    aprRewardAmountRaw: null,
    aprTotalSupplyAtFundingRaw: null,
    aprFundingBlockNumber: null,
    rewardSinkAddress: null,
    redeemInventory: [],
    id20Address: null,
    id20BalanceRaw: 0n,
  };
}

function earnAprBasisQueryKey(params: {
  chainId: number;
  assetLedgerAddress: Address | null | undefined;
  productKeys: string[];
}) {
  return [
    EARN_APR_QUERY_PREFIX,
    params.chainId,
    params.assetLedgerAddress?.toLowerCase() ?? null,
    [...new Set(params.productKeys)].sort(),
  ] as const;
}

type RewardSinkScanTarget = {
  key: string;
  sinkAddress: Address;
  fromBlock: bigint;
};

async function scanRewardsFundedEvents(params: {
  publicClient: PublicClient;
  chainId: number;
  targets: RewardSinkScanTarget[];
}) {
  const uniqueTargets = new Map<string, RewardSinkScanTarget>();
  for (const target of params.targets) {
    uniqueTargets.set(target.key.toLowerCase(), {
      ...target,
      key: target.key.toLowerCase(),
      sinkAddress: target.sinkAddress,
    });
  }
  if (uniqueTargets.size === 0) return new Map<string, FundingEventSnapshot>();

  const cache = getFundingScanCache(params.chainId);
  if (cache.inFlight) await cache.inFlight;

  const scanPromise = (async () => {
    const latest = await params.publicClient.getBlock();
    const latestBlock = latest.number;

    await Promise.all(
      [...uniqueTargets.values()].map(async (target) => {
        const key = target.key;
        let checkedTip = cache.checkedTipByAddress.get(key);
        if (checkedTip) {
          const canonicalTip =
            checkedTip.blockNumber <= latestBlock
              ? await params.publicClient
                  .getBlock({ blockNumber: checkedTip.blockNumber })
                  .catch(() => null)
              : null;
          if (canonicalTip?.hash.toLowerCase() !== checkedTip.blockHash.toLowerCase()) {
            cache.latestByAddress.delete(key);
            cache.checkedTipByAddress.delete(key);
            checkedTip = undefined;
          }
        }
        if (checkedTip && checkedTip.blockNumber >= latestBlock) return;

        const deploymentBlock = target.fromBlock > 0n ? target.fromBlock : 0n;
        const fromBlock =
          checkedTip && checkedTip.blockNumber + 1n > deploymentBlock
            ? checkedTip.blockNumber + 1n
            : deploymentBlock;

        if (fromBlock > latestBlock) {
          cache.checkedTipByAddress.set(key, {
            blockNumber: latestBlock,
            blockHash: latest.hash,
          });
          return;
        }

        const log = await findLatestEventLogByChunks({
          chainId: params.chainId,
          contractAddress: target.sinkAddress,
          eventName: "RewardsFunded",
          fromBlock,
          toBlock: latestBlock,
          chunkSize: REWARDS_FUNDED_SCAN_CHUNK_SIZE,
          getBlockHash: async (blockNumber) =>
            params.publicClient
              .getBlock({ blockNumber })
              .then((block) => block.hash)
              .catch(() => null),
          fetchRange: async (rangeFromBlock, rangeToBlock) => {
            const logs = await params.publicClient.getLogs({
              address: target.sinkAddress,
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

        cache.checkedTipByAddress.set(key, {
          blockNumber: latestBlock,
          blockHash: latest.hash,
        });
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
    [...uniqueTargets.keys()]
      .map((address) => [address, cache.latestByAddress.get(address)])
      .filter((entry): entry is [string, FundingEventSnapshot] => Boolean(entry[1])),
  );
}

async function readTotalSupplyAtBlock(params: {
  publicClient: PublicClient;
  chainId: number;
  ledgerAbi: Abi;
  ledgerAddress: Address;
  trancheId: bigint;
  blockNumber: bigint;
}) {
  const blockHash = await params.publicClient
    .getBlock({ blockNumber: params.blockNumber })
    .then((block) => block.hash)
    .catch(() => null);
  if (!blockHash) return null;

  const cacheKey = [
    params.chainId,
    params.ledgerAddress.toLowerCase(),
    params.trancheId.toString(),
    params.blockNumber.toString(),
    blockHash.toLowerCase(),
  ].join(":");

  const existing = totalSupplyAtBlockCache.get(cacheKey);
  if (existing) return existing;

  const promise = params.publicClient
    .readContract({
      address: params.ledgerAddress,
      abi: params.ledgerAbi,
      functionName: "totalSupply",
      args: [params.trancheId],
      blockNumber: params.blockNumber,
    })
    .then(readBigint)
    .catch(() => null);

  totalSupplyAtBlockCache.set(cacheKey, promise);
  return promise;
}

function parseLockedValue(result: unknown) {
  if (!result) return { amount: 0n, end: null, isPermanent: false };

  if (Array.isArray(result)) {
    const amountRaw = result[0];
    const amount =
      typeof amountRaw === "bigint"
        ? amountRaw < 0n
          ? -amountRaw
          : amountRaw
        : readBigint(amountRaw) ?? 0n;
    return {
      amount,
      end: readBigint(result[1]) ?? null,
      isPermanent: Boolean(result[2]),
    };
  }

  if (typeof result === "object") {
    const payload = result as { amount?: unknown; end?: unknown; isPermanent?: unknown };
    const amountRaw = payload.amount;
    let amount = 0n;
    if (typeof amountRaw === "bigint") {
      amount = amountRaw < 0n ? -amountRaw : amountRaw;
    } else {
      amount = readBigint(amountRaw) ?? 0n;
    }
    return {
      amount,
      end: readBigint(payload.end) ?? null,
      isPermanent: Boolean(payload.isPermanent),
    };
  }

  return { amount: 0n, end: null, isPermanent: false };
}

function parseTokenIdList(result: unknown): bigint[] {
  if (!Array.isArray(result)) return [];
  return result.filter((tokenId): tokenId is bigint => typeof tokenId === "bigint");
}

export function useEarnSnapshot() {
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const assetLedger = earnContracts.ledger;
  const ledgerAbi = earnContracts.ledger?.abi as Abi | undefined;
  const vault = earnContracts.vault;
  const veBtc = earnContracts.veBtc;
  const veMezo = earnContracts.veMezo;
  const tranchePortfolio = useTranchePortfolio();
  const rewardsPortfolio = useRewardsPortfolio();
  const id20Portfolio = useId20Portfolio();

  const supportedVeNfts = useMemo(
    () =>
      [
        veBtc?.address && veBtc.abi
          ? ({
              variant: "veBTC" as const,
              veNftAddress: veBtc.address,
              abi: veBtc.abi,
            } as const)
          : null,
        veMezo?.address && veMezo.abi
          ? ({
              variant: "veMEZO" as const,
              veNftAddress: veMezo.address,
              abi: veMezo.abi,
            } as const)
          : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [veBtc, veMezo],
  );

  const canReadLedger = Boolean(assetLedger?.address && assetLedger.abi && ledgerAbi);

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

  const veBtcUnderlyingAddress = readAddress(
    veBtc?.address ? protocolReads.data?.[0]?.result : undefined,
  );
  const veMezoUnderlyingAddress = readAddress(
    veMezo?.address ? protocolReads.data?.[veBtc?.address ? 1 : 0]?.result : undefined,
  );

  const managedTrancheCore = useMemo<ManagedTrancheCore[]>(() => {
    if (!assetLedger?.address) return [];

    return supportedVeNfts
      .map((entry) => {
        const trancheNumber = MAX_EPOCHS_BY_VARIANT[entry.variant];
        const trancheId = deriveTrancheId(entry.variant, trancheNumber);
        return {
          ledgerAddress: assetLedger.address,
          symbol: symbolOf(entry.variant, trancheNumber),
          name: nameOf(entry.variant, trancheNumber),
          trancheId,
          trancheNumber,
          variant: entry.variant,
          veNFT: entry.veNftAddress,
        } satisfies ManagedTrancheCore;
      })
      .sort((a, b) =>
        a.variant === b.variant
          ? Number(a.trancheId - b.trancheId)
          : a.variant.localeCompare(b.variant),
      );
  }, [assetLedger, supportedVeNfts]);

  const baseProducts = useMemo(
    () =>
      managedTrancheCore
        .map((core) => emptyProductCore(core))
        .sort((a, b) => a.variant.localeCompare(b.variant) || a.trancheNumber - b.trancheNumber),
    [managedTrancheCore],
  );

  const rewardSinkContracts = useMemo(() => {
    if (!vault?.address || !vault.abi || baseProducts.length === 0) return [];

    return baseProducts.map((product) => ({
      address: vault.address,
      abi: vault.abi,
      functionName: "rewardSinkOfTranche",
      args: [product.trancheId],
      chainId,
    }));
  }, [baseProducts, chainId, vault]);

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

  const productStaticContracts = useMemo(() => {
    if (!canReadLedger || baseProducts.length === 0 || !ledgerAbi) return [];

    const rewardSinkAbi = earnContracts.rewardSink?.abi as Abi | undefined;

    return baseProducts.flatMap((product, index) => {
      const rewardSinkAddress = rewardSinkAddresses[index] ?? null;
      const contracts: Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }> = [
        {
          address: product.ledgerAddress,
          abi: ledgerAbi,
          functionName: "totalSupply",
          args: [product.trancheId],
          chainId,
        },
      ];

      if (rewardSinkAddress && rewardSinkAbi) {
        contracts.push({
          address: rewardSinkAddress,
          abi: rewardSinkAbi,
          functionName: "rewardReserve",
          chainId,
        });
      } else {
        contracts.push({
          address: product.ledgerAddress,
          abi: ledgerAbi,
          functionName: "totalSupply",
          args: [product.trancheId],
          chainId,
        });
      }

      return contracts;
    });
  }, [
    baseProducts,
    canReadLedger,
    chainId,
    earnContracts.rewardSink?.abi,
    ledgerAbi,
    rewardSinkAddresses,
  ]);

  const productStaticReads = useReadContracts({
    allowFailure: true,
    contracts: productStaticContracts,
    query: {
      enabled: productStaticContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const rewardAssetAddresses = useMemo(() => {
    return [veBtcUnderlyingAddress, veMezoUnderlyingAddress].filter(
      (address): address is Address => Boolean(address),
    );
  }, [veBtcUnderlyingAddress, veMezoUnderlyingAddress]);

  const rewardTokenMeta = useErc20MetadataMap({
    chainId,
    addresses: rewardAssetAddresses,
    enabled: rewardAssetAddresses.length > 0,
  });

  const veBtcTokenBalance = useKnownMezoTokenBalance({
    tokenAddress: veBtcUnderlyingAddress,
    tokenSymbol: "BTC",
    chainId,
  });
  const veMezoTokenBalance = useKnownMezoTokenBalance({
    tokenAddress: veMezoUnderlyingAddress,
    tokenSymbol: "MEZO",
    chainId,
  });

  const tokens = useMemo<Record<EarnVariant, EarnTokenInfo | null>>(() => {
    const veBtcToken =
      veBtc?.address && veBtcUnderlyingAddress
        ? {
            veNftAddress: veBtc.address,
            underlyingAddress: veBtcUnderlyingAddress,
            symbol:
              rewardTokenMeta.metadataByAddress[veBtcUnderlyingAddress.toLowerCase()]?.symbol ??
              "BTC",
            decimals:
              rewardTokenMeta.metadataByAddress[veBtcUnderlyingAddress.toLowerCase()]?.decimals ??
              18,
            balanceRaw: veBtcTokenBalance.balanceRaw,
          }
        : null;

    const veMezoToken =
      veMezo?.address && veMezoUnderlyingAddress
        ? {
            veNftAddress: veMezo.address,
            underlyingAddress: veMezoUnderlyingAddress,
            symbol:
              rewardTokenMeta.metadataByAddress[veMezoUnderlyingAddress.toLowerCase()]?.symbol ??
              "MEZO",
            decimals:
              rewardTokenMeta.metadataByAddress[veMezoUnderlyingAddress.toLowerCase()]?.decimals ??
              18,
            balanceRaw: veMezoTokenBalance.balanceRaw,
          }
        : null;

    return {
      veBTC: veBtcToken,
      veMEZO: veMezoToken,
    };
  }, [
    rewardTokenMeta.metadataByAddress,
    veBtc,
    veBtcTokenBalance.balanceRaw,
    veBtcUnderlyingAddress,
    veMezo,
    veMezoTokenBalance.balanceRaw,
    veMezoUnderlyingAddress,
  ]);

  const products = useMemo<EarnProduct[]>(() => {
    return baseProducts.map((product, index) => {
      const staticCursor = index * PRODUCT_STATIC_READS;

      const totalSupply = readBigint(readResult<unknown>(productStaticReads.data, staticCursor));
      const rewardReserveRaw = readBigint(
        readResult<unknown>(productStaticReads.data, staticCursor + 1),
      );

      const rewardPortfolioKey = product.variant === "veBTC" ? "avBTCm" : "avMEZOm";
      const claimableRewardsRaw =
        rewardsPortfolio.data?.rewards[rewardPortfolioKey]?.rawClaimable ?? 0n;
      const userBalanceRaw =
        Object.values(tranchePortfolio.data?.balances ?? {}).find(
          (balance) => balance.trancheId === product.trancheId,
        )?.rawBalance ?? 0n;
      const userAvailableBalanceRaw = userBalanceRaw;
      const rewardSinkAddress = rewardSinkAddresses[index] ?? null;
      const rewardAsset =
        product.variant === "veBTC" ? veBtcUnderlyingAddress : veMezoUnderlyingAddress;
      const rewardMeta = rewardAsset
        ? rewardTokenMeta.metadataByAddress[rewardAsset.toLowerCase()]
        : undefined;
      const id20Key = product.variant === "veBTC" ? "avBTCm" : "avMEZOm";
      const id20Balance = id20Portfolio.data?.balances[id20Key];
      const id20Address =
        id20Balance?.address ??
        (product.variant === "veBTC"
          ? earnContracts.auroveId20?.address
          : earnContracts.mezoAuroveId20?.address) ??
        null;

      return {
        ...product,
        totalSupplyRaw: totalSupply,
        rewardAsset,
        rewardSymbol: rewardMeta?.symbol ?? (product.variant === "veBTC" ? "BTC" : "MEZO"),
        rewardDecimals: rewardMeta?.decimals ?? 18,
        rewardReserveRaw,
        rewardSinkAddress,
        decimals: 18,
        claimableRewardsRaw,
        userAvailableBalanceRaw,
        userBalanceRaw,
        redeemInventory: [],
        id20Address: id20Address ?? null,
        id20BalanceRaw: id20Balance?.rawBalance ?? 0n,
      };
    });
  }, [
    baseProducts,
    earnContracts.auroveId20?.address,
    earnContracts.mezoAuroveId20?.address,
    id20Portfolio.data,
    productStaticReads.data,
    rewardSinkAddresses,
    rewardTokenMeta.metadataByAddress,
    rewardsPortfolio.data,
    tranchePortfolio.data,
    veBtcUnderlyingAddress,
    veMezoUnderlyingAddress,
  ]);

  const snapshot = useMemo<EarnSnapshot>(() => {
    return {
      products,
      liveProductCount: products.length,
      userPositions: selectEarnUserPositions(products),
      tokens,
      supportedVeNfts,
    };
  }, [products, supportedVeNfts, tokens]);

  const isLoading =
    protocolReads.isLoading ||
    productStaticReads.isLoading ||
    rewardTokenMeta.isLoading ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking;
  const portfolioLoading =
    tranchePortfolio.isLoading || rewardsPortfolio.isLoading || id20Portfolio.isLoading;
  const positionsLoading =
    protocolReads.isLoading || tranchePortfolio.isLoading || id20Portfolio.isLoading;
  const positionsFetching =
    protocolReads.isFetching || tranchePortfolio.isFetching || id20Portfolio.isFetching;

  const isFetching =
    protocolReads.isFetching ||
    productStaticReads.isFetching ||
    rewardTokenMeta.isFetching ||
    veBtcTokenBalance.isChecking ||
    veMezoTokenBalance.isChecking ||
    tranchePortfolio.isFetching ||
    rewardsPortfolio.isFetching ||
    id20Portfolio.isFetching;

  const error =
    (protocolReads.error as Error | null) ||
    (productStaticReads.error as Error | null) ||
    (rewardTokenMeta.error as Error | null) ||
    (veBtcTokenBalance.error as Error | null) ||
    (veMezoTokenBalance.error as Error | null) ||
    (tranchePortfolio.error as Error | null) ||
    (rewardsPortfolio.error as Error | null) ||
    (id20Portfolio.error as Error | null) ||
    null;

  function refresh() {
    void Promise.all([
      protocolReads.refetch(),
      productStaticReads.refetch(),
      rewardTokenMeta.refresh(),
      veBtcTokenBalance.refresh(),
      veMezoTokenBalance.refresh(),
      tranchePortfolio.refetch(),
      rewardsPortfolio.refetch(),
      id20Portfolio.refetch(),
    ]);
    void queryClient.invalidateQueries({ queryKey: [EARN_APR_QUERY_PREFIX] });
  }

  return {
    chainId,
    assetLedger,
    ledgerAbi,
    supportedVeNfts,
    products: snapshot.products,
    liveProductCount: snapshot.liveProductCount,
    userPositions: snapshot.userPositions,
    tokens: snapshot.tokens,
    isLoading: isLoading || portfolioLoading,
    isFetching,
    positionsLoading,
    positionsFetching,
    error,
    refresh,
  };
}

export function useEarnProductDetails(
  product: EarnProduct,
  enabled: boolean,
  aprBasisMapOverride?: EarnAprBasisMap | null,
) {
  const connectedChainId = useChainId();
  const queryClient = useQueryClient();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const earnContracts = useMemo(() => getEarnProtocolConfig(chainId), [chainId]);
  const ledgerAbi = earnContracts.ledger?.abi as Abi | undefined;
  const vault = earnContracts.vault;
  const veNftAbi =
    (product.variant === "veBTC" ? earnContracts.veBtc : earnContracts.veMezo)?.abi;

  const snapshot = useEarnSnapshot();

  const aprQuery = useAprBasis({
    enabled: enabled && !aprBasisMapOverride,
    products: [product],
    chainId,
    ledgerAbi,
  });

  const aprBasisMap = useMemo<EarnAprBasisMap>(
    () => aprBasisMapOverride ?? aprQuery.data ?? {},
    [aprBasisMapOverride, aprQuery.data],
  );

  const inventoryContracts = useMemo(() => {
    if (!enabled || !vault?.address || !vault.abi) {
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
        address: vault.address,
        abi: vault.abi as Abi,
        functionName: "veNftsOfTranche",
        args: [product.trancheId],
        chainId,
      },
    ];
  }, [chainId, enabled, product.trancheId, vault]);

  const inventoryReads = useReadContracts({
    allowFailure: true,
    contracts: inventoryContracts,
    query: {
      enabled: inventoryContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const inventoryTokenIds = useMemo(() => {
    if (!inventoryReads.data?.[0]) return [] as bigint[];
    // useReadContracts with allowFailure wraps each entry; only use successful results.
    const entry = inventoryReads.data[0];
    if (entry && "status" in entry && entry.status === "failure") return [] as bigint[];
    return parseTokenIdList(entry?.result);
  }, [inventoryReads.data]);

  // Vault custodies free veNFTs via depositManaged. While deposited:
  //   locked(tokenId).amount == 0
  //   withdrawable size on redeem ≈ weights(tokenId, mTokenId) + lockedManagedReward.earned
  // Free (non-deposited) locks still report via locked().
  const inventoryMetaContracts = useMemo(() => {
    const veNftAddress = product.veNFT;
    if (!enabled || !veNftAddress || !veNftAbi || inventoryTokenIds.length === 0) {
      return [] as Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }>;
    }

    return inventoryTokenIds.flatMap((tokenId) => [
      {
        address: veNftAddress,
        abi: veNftAbi,
        functionName: "locked",
        args: [tokenId],
        chainId,
      },
      {
        address: veNftAddress,
        abi: veNftAbi,
        functionName: "idToManaged",
        args: [tokenId],
        chainId,
      },
    ]);
  }, [chainId, enabled, inventoryTokenIds, product.veNFT, veNftAbi]);

  const inventoryMetaReads = useReadContracts({
    allowFailure: true,
    contracts: inventoryMetaContracts,
    query: {
      enabled: inventoryMetaContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const weightTargets = useMemo(() => {
    if (!product.veNFT || inventoryTokenIds.length === 0 || !inventoryMetaReads.data) {
      return [] as Array<{ tokenId: bigint; managedTokenId: bigint }>;
    }

    return inventoryTokenIds.flatMap((tokenId, index) => {
      const base = index * REDEEM_INVENTORY_META_READS;
      const lock = parseLockedValue(inventoryMetaReads.data?.[base]?.result);
      if (lock.amount > 0n) return [];
      const managedTokenId = readBigint(inventoryMetaReads.data?.[base + 1]?.result);
      if (!managedTokenId || managedTokenId === 0n) return [];
      return [{ tokenId, managedTokenId }];
    });
  }, [inventoryMetaReads.data, inventoryTokenIds, product.veNFT]);

  const uniqueManagedTokenIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: bigint[] = [];
    for (const target of weightTargets) {
      const key = target.managedTokenId.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      ids.push(target.managedTokenId);
    }
    return ids;
  }, [weightTargets]);

  const managedRewardContracts = useMemo(() => {
    const veNftAddress = product.veNFT;
    if (!enabled || !veNftAddress || !veNftAbi || uniqueManagedTokenIds.length === 0) {
      return [] as Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }>;
    }

    return uniqueManagedTokenIds.map((managedTokenId) => ({
      address: veNftAddress,
      abi: veNftAbi,
      functionName: "managedToLocked",
      args: [managedTokenId],
      chainId,
    }));
  }, [chainId, enabled, product.veNFT, uniqueManagedTokenIds, veNftAbi]);

  const managedRewardReads = useReadContracts({
    allowFailure: true,
    contracts: managedRewardContracts,
    query: {
      enabled: managedRewardContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const lockedRewardByManagedId = useMemo(() => {
    const map = new Map<string, Address>();
    uniqueManagedTokenIds.forEach((managedTokenId, index) => {
      const address = readAddress(managedRewardReads.data?.[index]?.result);
      if (address && !/^0x0{40}$/i.test(address)) {
        map.set(managedTokenId.toString(), address);
      }
    });
    return map;
  }, [managedRewardReads.data, uniqueManagedTokenIds]);

  const weightAndEarnedContracts = useMemo(() => {
    const veNftAddress = product.veNFT;
    const rewardToken = product.rewardAsset;
    if (!enabled || !veNftAddress || !veNftAbi || weightTargets.length === 0) {
      return [] as Array<{
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
        chainId: number;
      }>;
    }

    return weightTargets.flatMap(({ tokenId, managedTokenId }) => {
      const weightCall = {
        address: veNftAddress,
        abi: veNftAbi,
        functionName: "weights",
        args: [tokenId, managedTokenId],
        chainId,
      };
      const rewardContract = lockedRewardByManagedId.get(managedTokenId.toString());
      if (!rewardContract || !rewardToken) {
        return [weightCall];
      }
      return [
        weightCall,
        {
          address: rewardContract,
          abi: LOCKED_MANAGED_REWARD_ABI as Abi,
          functionName: "earned",
          args: [rewardToken, tokenId],
          chainId,
        },
      ];
    });
  }, [
    chainId,
    enabled,
    lockedRewardByManagedId,
    product.rewardAsset,
    product.veNFT,
    veNftAbi,
    weightTargets,
  ]);

  const weightAndEarnedReads = useReadContracts({
    allowFailure: true,
    contracts: weightAndEarnedContracts,
    query: {
      enabled: weightAndEarnedContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const redeemInventory = useMemo<EarnRedeemInventory[]>(() => {
    if (!product.veNFT || inventoryTokenIds.length === 0) return [];

    // weightAndEarnedContracts is ordered as [weights, earned?] per weightTarget.
    const managedSizeByTokenId = new Map<string, { weight: bigint; withdrawable: bigint }>();
    let cursor = 0;
    for (const target of weightTargets) {
      const weight = readBigint(weightAndEarnedReads.data?.[cursor]?.result) ?? 0n;
      cursor += 1;
      const rewardContract = lockedRewardByManagedId.get(target.managedTokenId.toString());
      let earned = 0n;
      if (rewardContract && product.rewardAsset) {
        earned = readBigint(weightAndEarnedReads.data?.[cursor]?.result) ?? 0n;
        cursor += 1;
      }
      if (earned < 0n) earned = 0n;
      const withdrawable = weight + earned;
      if (withdrawable > 0n || weight > 0n) {
        managedSizeByTokenId.set(target.tokenId.toString(), { weight, withdrawable });
      }
    }

    const positions: EarnRedeemInventory[] = [];

    for (let index = 0; index < inventoryTokenIds.length; index += 1) {
      const tokenId = inventoryTokenIds[index]!;
      const base = index * REDEEM_INVENTORY_META_READS;
      const lock = parseLockedValue(inventoryMetaReads.data?.[base]?.result);
      let lockedAmountRaw = lock.amount;
      let shareAmountRaw = lock.amount;
      let unlockTime = lock.end;

      if (lockedAmountRaw <= 0n) {
        const managed = managedSizeByTokenId.get(tokenId.toString());
        // Display / capacity: free size after withdrawManaged (weight + locked rewards).
        lockedAmountRaw = managed?.withdrawable ?? 0n;
        // MEZO share burn: deposit weight only (shares were minted on deposit weight).
        shareAmountRaw = managed?.weight ?? 0n;
        unlockTime = null;
      }

      if (lockedAmountRaw <= 0n && shareAmountRaw <= 0n) continue;
      if (shareAmountRaw <= 0n) shareAmountRaw = lockedAmountRaw;
      if (lockedAmountRaw <= 0n) lockedAmountRaw = shareAmountRaw;

      positions.push({
        key: `${product.veNFT}-${tokenId.toString()}`,
        veNft: product.veNFT,
        tokenId,
        lockedAmountRaw,
        shareAmountRaw,
        unlockTime,
      });
    }

    return positions;
  }, [
    inventoryMetaReads.data,
    inventoryTokenIds,
    lockedRewardByManagedId,
    product.rewardAsset,
    product.veNFT,
    weightAndEarnedReads.data,
    weightTargets,
  ]);

  const hydratedProduct = useMemo<EarnProduct>(() => {
    const baseProduct =
      snapshot.products.find(
        (entry) =>
          sameAddress(entry.ledgerAddress, product.ledgerAddress) &&
          entry.trancheId === product.trancheId,
      ) ?? product;

    const aprBasis = aprBasisMap[earnAprProductKey(baseProduct)];

    return {
      ...baseProduct,
      aprRewardAmountRaw: aprBasis?.rewardAmountRaw ?? null,
      aprTotalSupplyAtFundingRaw: aprBasis?.totalSupplyAtFundingRaw ?? null,
      aprFundingBlockNumber: aprBasis?.fundingBlockNumber ?? null,
      redeemInventory,
    };
  }, [aprBasisMap, product, redeemInventory, snapshot.products]);

  function refresh() {
    snapshot.refresh();
    void inventoryReads.refetch();
    void inventoryMetaReads.refetch();
    void managedRewardReads.refetch();
    void weightAndEarnedReads.refetch();
    void queryClient.invalidateQueries({ queryKey: [EARN_APR_QUERY_PREFIX] });
  }

  return {
    product: hydratedProduct,
    isLoading:
      snapshot.isLoading ||
      inventoryReads.isLoading ||
      inventoryMetaReads.isLoading ||
      managedRewardReads.isLoading ||
      weightAndEarnedReads.isLoading ||
      aprQuery.isLoading,
    isFetching:
      snapshot.isFetching ||
      inventoryReads.isFetching ||
      inventoryMetaReads.isFetching ||
      managedRewardReads.isFetching ||
      weightAndEarnedReads.isFetching ||
      aprQuery.isFetching,
    error:
      snapshot.error ||
      (inventoryReads.error as Error | null) ||
      (inventoryMetaReads.error as Error | null) ||
      (managedRewardReads.error as Error | null) ||
      (weightAndEarnedReads.error as Error | null) ||
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
  const protocol = getEarnProtocolConfig(chainId);
  const assetLedger = protocol.ledger;
  const ledgerAbi = assetLedger?.abi as Abi | undefined;

  const validProducts = products.filter(
    (product) =>
      product.ledgerAddress !== ZERO_ADDRESS &&
      product.rewardSinkAddress &&
      product.rewardSinkAddress !== ZERO_ADDRESS,
  );
  if (validProducts.length === 0 || !assetLedger?.address || !ledgerAbi) return {};

  const btcSinkFromBlock = BigInt(
    protocol.rewardSink?.deploymentBlock || assetLedger.deploymentBlock || 0,
  );
  const mezoSinkFromBlock = BigInt(
    protocol.mezoRewardSink?.deploymentBlock || assetLedger.deploymentBlock || 0,
  );

  const targets = validProducts.map((product) => ({
    key: earnAprProductKey(product),
    sinkAddress: product.rewardSinkAddress as Address,
    fromBlock: product.variant === "veBTC" ? btcSinkFromBlock : mezoSinkFromBlock,
  }));

  const latestFundings = await scanRewardsFundedEvents({
    publicClient,
    chainId,
    targets,
  });

  const result: EarnAprBasisMap = {};

  await Promise.all(
    validProducts.map(async (product) => {
      const key = earnAprProductKey(product);
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
        ledgerAddress: product.ledgerAddress,
        ledgerAbi,
        trancheId: product.trancheId,
        blockNumber: supplyBlockNumber,
      });

      result[key] =
        totalSupplyAtFundingRaw !== null && totalSupplyAtFundingRaw !== undefined
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
  ledgerAbi: Abi | undefined;
}) {
  const { enabled, products, chainId, ledgerAbi } = params;
  const publicClient = usePublicClient();
  const assetLedger = getEarnProtocolConfig(chainId).ledger;
  const productsWithSinks = products.filter(
    (product) => product.rewardSinkAddress && product.rewardSinkAddress !== ZERO_ADDRESS,
  );

  const queryKey = earnAprBasisQueryKey({
    chainId,
    assetLedgerAddress: assetLedger?.address,
    productKeys: productsWithSinks.map((product) => earnAprProductKey(product)),
  });

  return useQuery({
    enabled:
      enabled &&
      Boolean(
        publicClient && assetLedger?.address && ledgerAbi && productsWithSinks.length > 0,
      ),
    queryKey,
    queryFn: async () => {
      if (!publicClient) {
        return {};
      }

      return fetchAprBasisMap({
        products: productsWithSinks,
        chainId,
        publicClient,
      });
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
}
