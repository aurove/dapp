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

function asAddress(value: unknown): Address | null {
  return typeof value === "string" && value.startsWith("0x") ? (value as Address) : null;
}

function asBigint(value: unknown): bigint | null {
  return typeof value === "bigint" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function sameAddress(a: Address | null | undefined, b: Address | null | undefined) {
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

export function useEarnData() {
  const { address: userAddress } = useAccount();
  const connectedChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = connectedChainId ?? activeChain.id;
  const publicClient = usePublicClient();

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

  const fractionReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddresses.flatMap((address) => [
      { address, abi: assetFractionAbi, functionName: "symbol", chainId },
      { address, abi: assetFractionAbi, functionName: "name", chainId },
      { address, abi: assetFractionAbi, functionName: "trancheId", chainId },
      { address, abi: assetFractionAbi, functionName: "veNFT", chainId },
      { address, abi: assetFractionAbi, functionName: "totalSupply", chainId },
      { address, abi: assetFractionAbi, functionName: "currentLifecycle", chainId },
      { address, abi: assetFractionAbi, functionName: "isTargetSettlementWindow", chainId },
      { address, abi: assetFractionAbi, functionName: "isRolloverAvailable", chainId },
      { address, abi: assetFractionAbi, functionName: "targetEpochEnd", chainId },
      { address, abi: assetFractionAbi, functionName: "trancheDuration", chainId },
      { address, abi: assetFractionAbi, functionName: "trancheLengthEpochs", chainId },
      { address, abi: assetFractionAbi, functionName: "rewardAsset", chainId },
      { address, abi: assetFractionAbi, functionName: "rewardReserve", chainId },
      { address, abi: assetFractionAbi, functionName: "settledUnderlying", chainId },
      ...(userAddress
        ? [
            {
              address,
              abi: assetFractionAbi,
              functionName: "claimableRewards",
              args: [userAddress],
              chainId,
            },
            {
              address,
              abi: assetFractionAbi,
              functionName: "availableBalanceOf",
              args: [userAddress],
              chainId,
            },
          ]
        : []),
    ]),
    query: {
      enabled: Boolean(assetFractionAbi) && fractionAddresses.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const rowSize = userAddress ? 16 : 14;

  const fractionCore = useMemo<FractionCore[]>(() => {
    return fractionAddresses.map((address, index) => {
      const offset = index * rowSize;
      const symbolResult = fractionReads.data?.[offset]?.result;
      const nameResult = fractionReads.data?.[offset + 1]?.result;
      const trancheResult = asBigint(fractionReads.data?.[offset + 2]?.result) ?? 0n;
      return {
        address,
        symbol:
          typeof symbolResult === "string" && symbolResult.trim()
            ? symbolResult.trim()
            : `${address.slice(0, 6)}...${address.slice(-4)}`,
        name:
          typeof nameResult === "string" && nameResult.trim() ? nameResult.trim() : "Earn claim",
        trancheId: trancheResult,
        veNFT: asAddress(fractionReads.data?.[offset + 3]?.result),
        decoded: decodeTrancheId(trancheResult),
      };
    });
  }, [fractionAddresses, fractionReads.data, rowSize]);

  const ledgerBalanceReads = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi && userAddress
        ? fractionCore.map((fraction) => ({
            address: assetLedger.address,
            abi: assetLedger.abi,
            functionName: "balanceOf",
            args: [userAddress, fraction.trancheId],
            chainId,
          }))
        : [],
    query: {
      enabled:
        Boolean(assetLedger?.address && assetLedger.abi && userAddress) && fractionCore.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const ledgerBalancesByTranche = useMemo(() => {
    const balances = new Map<string, bigint>();
    fractionCore.forEach((fraction, index) => {
      balances.set(
        fraction.trancheId.toString(),
        asBigint(ledgerBalanceReads.data?.[index]?.result) ?? 0n,
      );
    });
    return balances;
  }, [fractionCore, ledgerBalanceReads.data]);

  const [aprBasisByFraction, setAprBasisByFraction] = useState<Record<string, AprBasis>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadAprBasis() {
      if (
        !publicClient ||
        !assetLedger?.address ||
        !assetFractionAbi ||
        fractionCore.length === 0
      ) {
        await Promise.resolve();
        if (!cancelled) setAprBasisByFraction({});
        return;
      }

      const latestFundings = await scanRewardsFundedEvents({
        publicClient,
        chainId,
        assetLedgerAddress: assetLedger.address,
        assetLedgerDeploymentBlock: BigInt(assetLedger.deploymentBlock ?? 0),
        addresses: fractionCore.map((item) => item.address),
      });

      const entries = await Promise.all(
        fractionCore.map(async (fraction) => {
          const key = fraction.address.toLowerCase();

          try {
            const latestFunding = latestFundings.get(key);
            if (!latestFunding) return null;

            const fundingBlockNumber = latestFunding.blockNumber;
            const supplyBlockNumber =
              fundingBlockNumber > 0n ? fundingBlockNumber - 1n : fundingBlockNumber;
            const totalSupplyAtFundingRaw = await readTotalSupplyAtBlock({
              publicClient,
              chainId,
              address: fraction.address,
              assetFractionAbi,
              blockNumber: supplyBlockNumber,
            });
            if (!totalSupplyAtFundingRaw) return null;

            return [
              key,
              {
                rewardAmountRaw: latestFunding.amount,
                totalSupplyAtFundingRaw,
                fundingBlockNumber,
              },
            ] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      setAprBasisByFraction(
        Object.fromEntries(
          entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
        ),
      );
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
    fractionCore,
    publicClient,
  ]);

  const rewardAssets = useMemo(() => {
    const assets = new Set<Address>();
    fractionAddresses.forEach((_, index) => {
      const rewardAsset = asAddress(fractionReads.data?.[index * rowSize + 11]?.result);
      if (rewardAsset) assets.add(rewardAsset);
    });
    return [...assets];
  }, [fractionAddresses, fractionReads.data, rowSize]);

  const rewardTokenReads = useReadContracts({
    allowFailure: true,
    contracts: rewardAssets.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol", chainId },
      { address, abi: erc20Abi, functionName: "decimals", chainId },
    ]),
    query: {
      enabled: rewardAssets.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const rewardTokenMeta = useMemo(() => {
    const map = new Map<string, { symbol: string; decimals: number }>();
    rewardAssets.forEach((address, index) => {
      const symbol = rewardTokenReads.data?.[index * 2]?.result;
      const decimals = rewardTokenReads.data?.[index * 2 + 1]?.result;
      map.set(address.toLowerCase(), {
        symbol: typeof symbol === "string" && symbol.trim() ? symbol : "Reward",
        decimals: asNumber(decimals) ?? 18,
      });
    });
    return map;
  }, [rewardAssets, rewardTokenReads.data]);

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

  const products = useMemo<EarnProduct[]>(() => {
    return fractionCore
      .map((fraction, index) => {
        const variant =
          fraction.decoded?.variant ??
          (sameAddress(fraction.veNFT, veBtc?.address)
            ? "veBTC"
            : sameAddress(fraction.veNFT, veMezo?.address)
              ? "veMEZO"
              : inferVariantFromSymbol(fraction.symbol));
        if (!variant || (variant !== "veBTC" && variant !== "veMEZO")) return null;

        const offset = index * rowSize;
        const rewardAsset = asAddress(fractionReads.data?.[offset + 11]?.result);
        const rewardMeta = rewardAsset ? rewardTokenMeta.get(rewardAsset.toLowerCase()) : null;

        const product: EarnProduct = {
          id: `${fraction.address}-${fraction.trancheId.toString()}`,
          fractionAddress: fraction.address,
          trancheId: fraction.trancheId,
          trancheNumber: fraction.decoded?.trancheNumber ?? Number(fraction.trancheId & 0xffffn),
          variant,
          name: fraction.name,
          symbol: fraction.symbol,
          totalSupplyRaw: asBigint(fractionReads.data?.[offset + 4]?.result),
          lifecycle: asNumber(fractionReads.data?.[offset + 5]?.result),
          isTargetSettlementWindow: asBoolean(fractionReads.data?.[offset + 6]?.result),
          isRolloverAvailable: asBoolean(fractionReads.data?.[offset + 7]?.result),
          targetEpochEnd: asBigint(fractionReads.data?.[offset + 8]?.result),
          trancheDuration: asBigint(fractionReads.data?.[offset + 9]?.result),
          trancheLengthEpochs: asBigint(fractionReads.data?.[offset + 10]?.result),
          rewardAsset,
          rewardSymbol: rewardMeta?.symbol ?? null,
          rewardDecimals: rewardMeta?.decimals ?? 18,
          rewardReserveRaw: asBigint(fractionReads.data?.[offset + 12]?.result),
          aprRewardAmountRaw:
            aprBasisByFraction[fraction.address.toLowerCase()]?.rewardAmountRaw ?? null,
          aprTotalSupplyAtFundingRaw:
            aprBasisByFraction[fraction.address.toLowerCase()]?.totalSupplyAtFundingRaw ?? null,
          aprFundingBlockNumber:
            aprBasisByFraction[fraction.address.toLowerCase()]?.fundingBlockNumber ?? null,
          settledUnderlyingRaw: asBigint(fractionReads.data?.[offset + 13]?.result),
          userBalanceRaw: ledgerBalancesByTranche.get(fraction.trancheId.toString()) ?? 0n,
          claimableRewardsRaw: asBigint(fractionReads.data?.[offset + 14]?.result) ?? 0n,
          userAvailableBalanceRaw: asBigint(fractionReads.data?.[offset + 15]?.result) ?? 0n,
        };

        return product;
      })
      .filter((product): product is EarnProduct => Boolean(product))
      .sort((a, b) => a.variant.localeCompare(b.variant) || a.trancheNumber - b.trancheNumber);
  }, [
    fractionCore,
    fractionReads.data,
    ledgerBalancesByTranche,
    aprBasisByFraction,
    rewardTokenMeta,
    rowSize,
    veBtc?.address,
    veMezo?.address,
  ]);

  const visibleProducts: EarnProduct[] = useMemo(() => {
    if (products.length > 0) return products;
    return supportedVeNfts.map((item) => ({
      id: `${item.variant}-starter`,
      fractionAddress: "0x0000000000000000000000000000000000000000" as Address,
      trancheId: deriveTrancheId(item.variant, 4),
      trancheNumber: 4,
      variant: item.variant,
      name: `${item.variant} liquid lock`,
      symbol: `f${item.variant}-W4`,
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
    }));
  }, [products, supportedVeNfts]);

  function refresh() {
    void countRead.refetch();
    void fractionAddressReads.refetch();
    void fractionReads.refetch();
    void ledgerBalanceReads.refetch();
    void rewardTokenReads.refetch();
    void tokenAddressReads.refetch();
    void tokenMetaReads.refetch();
  }

  const error =
    (countRead.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionReads.error as Error | null) ||
    (ledgerBalanceReads.error as Error | null) ||
    (rewardTokenReads.error as Error | null) ||
    (tokenAddressReads.error as Error | null) ||
    (tokenMetaReads.error as Error | null) ||
    null;

  return {
    chainId,
    assetLedger,
    assetFractionAbi,
    products: visibleProducts,
    liveProductCount: products.length,
    userPositions: products.filter((product) => product.userBalanceRaw > 0n),
    supportedVeNfts,
    tokens,
    isLoading:
      countRead.isLoading ||
      fractionAddressReads.isLoading ||
      fractionReads.isLoading ||
      ledgerBalanceReads.isLoading ||
      tokenAddressReads.isLoading ||
      tokenMetaReads.isLoading,
    isFetching:
      countRead.isFetching ||
      fractionAddressReads.isFetching ||
      fractionReads.isFetching ||
      ledgerBalanceReads.isFetching ||
      rewardTokenReads.isFetching ||
      tokenAddressReads.isFetching ||
      tokenMetaReads.isFetching,
    error,
    refresh,
  };
}
