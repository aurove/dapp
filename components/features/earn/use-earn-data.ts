"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getActiveChain } from "@/lib/config/chains";
import { detailReadQueryOptions, staticReadQueryOptions } from "@/lib/web3/read-query-options";
import { useChainTime } from "@/lib/web3/use-chain-time";
import {
  readAddress,
  readBigint,
  readBoolean,
  readResult,
} from "@/lib/web3/value-parsers";
import {
  EARN_VARIANTS,
  getEarnVariantConfig,
  getEarnProtocolRuntime,
  ledgerAbi,
  rewardAccountingAbi,
  auroveId20Abi,
  id20FactoryAbi,
  id20GaugeAbi,
  vaultAbi,
  type EarnVariant,
  type EarnProtocolRuntime,
  type EarnVariantConfig,
} from "./protocol";

const WEEK_SECONDS = 7n * 24n * 60n * 60n;
const STRUCTURAL_READS_PER_VARIANT = 5;
const USER_LEDGER_READS_PER_VARIANT = 3;
const WRAPPER_STATIC_READS_PER_VARIANT = 4;

type TokenIdsRead = bigint[];

export type EarnTrancheSnapshot = EarnVariantConfig & {
  ledgerAddress: Address | null;
  vaultAddress: Address | null;
  id20FactoryAddress: Address | null;
  totalSupplyRaw: bigint;
  managerAddress: Address | null;
  rewardSinkAddress: Address | null;
  vaultTokenIds: TokenIdsRead;
  userBalanceRaw: bigint;
  redeemableBalanceRaw: bigint;
  lockedBalanceRaw: bigint;
  rawRewardClaimableRaw: bigint;
  wrapperAddress: Address | null;
  wrapperBalanceRaw: bigint;
  wrapperBackingBalanceRaw: bigint;
  wrapperIsFullyBacked: boolean | null;
  wrapperGaugeAddress: Address | null;
  wrapperUpstreamRewardSinkAddress: Address | null;
  wrapperUpstreamClaimableRaw: bigint;
  wrapperClaimableRaw: bigint;
  wrapperIsActive: boolean;
  wrapperWeightRaw: bigint;
  wrapperDebtRaw: bigint;
  wrapperCreditRaw: bigint;
  wrapperLentRaw: bigint;
};

export type EarnSnapshot = {
  protocol: EarnProtocolRuntime;
  variantConfigs: EarnVariantConfig[];
  tranches: EarnTrancheSnapshot[];
  currentEpoch: bigint | null;
  settlementWindow: { opensAt: bigint; closesAt: bigint } | null;
  isSettlementWindowOpen: boolean;
  isConnected: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refresh: () => void;
};

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function parseError(value: unknown, fallbackMessage: string): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }
  return new Error(fallbackMessage);
}

function parseTokenIds(value: unknown): bigint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toBigInt(entry)).filter((tokenId) => tokenId > 0n);
}

function parseSettlementWindow(value: unknown): { opensAt: bigint; closesAt: bigint } | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    return {
      opensAt: toBigInt(value[0]),
      closesAt: toBigInt(value[1]),
    };
  }

  if (typeof value === "object") {
    const payload = value as { opensAt?: unknown; closesAt?: unknown };
    return {
      opensAt: toBigInt(payload.opensAt),
      closesAt: toBigInt(payload.closesAt),
    };
  }

  return null;
}

function parseGaugeMetadata(value: unknown): {
  isActive: boolean;
  weight: bigint;
  debt: bigint;
  credit: bigint;
  lent: bigint;
  accruedReward: bigint;
  earned: bigint;
} {
  if (Array.isArray(value)) {
    return {
      isActive: Boolean(value[0]),
      weight: toBigInt(value[1]),
      debt: toBigInt(value[2]),
      credit: toBigInt(value[3]),
      lent: toBigInt(value[4]),
      accruedReward: toBigInt(value[5]),
      earned: toBigInt(value[6]),
    };
  }

  if (typeof value === "object" && value !== null) {
    const payload = value as {
      isActive?: unknown;
      weight?: unknown;
      debt?: unknown;
      credit?: unknown;
      lent?: unknown;
      accruedReward?: unknown;
      earned?: unknown;
    };

    return {
      isActive: Boolean(payload.isActive),
      weight: toBigInt(payload.weight),
      debt: toBigInt(payload.debt),
      credit: toBigInt(payload.credit),
      lent: toBigInt(payload.lent),
      accruedReward: toBigInt(payload.accruedReward),
      earned: toBigInt(payload.earned),
    };
  }

  return {
    isActive: false,
    weight: 0n,
    debt: 0n,
    credit: 0n,
    lent: 0n,
    accruedReward: 0n,
    earned: 0n,
  };
}

export function useEarnSnapshot(): EarnSnapshot {
  const { address: userAddress, isConnected } = useAccount();
  const connectedChainId = useChainId();
  const activeChain = getActiveChain();
  const chainId = connectedChainId ?? activeChain.id;
  const chainTime = useChainTime();
  const currentEpoch =
    chainTime.chainTimestamp === null ? null : chainTime.chainTimestamp / WEEK_SECONDS;

  const protocol = useMemo(() => getEarnProtocolRuntime(chainId), [chainId]);
  const variantConfigs = useMemo(
    () => EARN_VARIANTS.map((variant) => getEarnVariantConfig(variant, protocol)),
    [protocol],
  );

  const protocolReady =
    Boolean(protocol.addresses.ledgerAddress) &&
    Boolean(protocol.addresses.vaultAddress) &&
    Boolean(protocol.addresses.id20FactoryAddress);

  const settlementContracts = useMemo(() => {
    if (!protocol.addresses.ledgerAddress || currentEpoch === null) return [];

    return [
      {
        address: protocol.addresses.ledgerAddress,
        abi: ledgerAbi,
        functionName: "settlementWindow" as const,
        args: [currentEpoch] as const,
        chainId,
      },
      {
        address: protocol.addresses.ledgerAddress,
        abi: ledgerAbi,
        functionName: "isSettlementWindowOpen" as const,
        chainId,
      },
    ];
  }, [chainId, currentEpoch, protocol.addresses.ledgerAddress]);

  const settlementReads = useReadContracts({
    allowFailure: true,
    contracts: settlementContracts,
    query: {
      enabled: settlementContracts.length > 0,
      ...staticReadQueryOptions,
    },
  });

  const settlementWindow = useMemo(() => {
    const parsed = parseSettlementWindow(settlementReads.data?.[0]?.result);
    return parsed;
  }, [settlementReads.data]);

  const isSettlementWindowOpen = Boolean(settlementReads.data?.[1]?.result);

  const structuralContracts = useMemo(() => {
    if (!protocolReady) return [];

    return variantConfigs.flatMap((config) => [
      {
        address: protocol.addresses.ledgerAddress!,
        abi: ledgerAbi,
        functionName: "totalSupply" as const,
        args: [config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.vaultAddress!,
        abi: vaultAbi,
        functionName: "managerOfTranche" as const,
        args: [config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.vaultAddress!,
        abi: vaultAbi,
        functionName: "rewardSinkOfTranche" as const,
        args: [config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.vaultAddress!,
        abi: vaultAbi,
        functionName: "veNftsOfTranche" as const,
        args: [config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.id20FactoryAddress!,
        abi: id20FactoryAbi,
        functionName: "getId20" as const,
        args: [config.trancheId] as const,
        chainId,
      },
    ]);
  }, [chainId, protocol.addresses, protocolReady, variantConfigs]);

  const structuralReads = useReadContracts({
    allowFailure: true,
    contracts: structuralContracts,
    query: {
      enabled: structuralContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const baseTranches = useMemo<EarnTrancheSnapshot[]>(() => {
    const data = structuralReads.data ?? [];

    return variantConfigs.map((config, index) => {
      const cursor = index * STRUCTURAL_READS_PER_VARIANT;

      return {
        ...config,
        ledgerAddress: protocol.addresses.ledgerAddress,
        vaultAddress: protocol.addresses.vaultAddress,
        id20FactoryAddress: protocol.addresses.id20FactoryAddress,
        totalSupplyRaw: readBigint(readResult(data, cursor)) ?? 0n,
        managerAddress: readAddress(readResult(data, cursor + 1)),
        rewardSinkAddress: readAddress(readResult(data, cursor + 2)),
        vaultTokenIds: parseTokenIds(readResult(data, cursor + 3)),
        wrapperAddress: readAddress(readResult(data, cursor + 4)),
        userBalanceRaw: 0n,
        redeemableBalanceRaw: 0n,
        lockedBalanceRaw: 0n,
        rawRewardClaimableRaw: 0n,
        wrapperBalanceRaw: 0n,
        wrapperBackingBalanceRaw: 0n,
        wrapperIsFullyBacked: null,
        wrapperGaugeAddress: null,
        wrapperUpstreamRewardSinkAddress: null,
        wrapperUpstreamClaimableRaw: 0n,
        wrapperClaimableRaw: 0n,
        wrapperIsActive: false,
        wrapperWeightRaw: 0n,
        wrapperDebtRaw: 0n,
        wrapperCreditRaw: 0n,
        wrapperLentRaw: 0n,
      };
    });
  }, [protocol.addresses.id20FactoryAddress, protocol.addresses.ledgerAddress, protocol.addresses.vaultAddress, structuralReads.data, variantConfigs]);

  const userLedgerContracts = useMemo(() => {
    if (!userAddress || !protocol.addresses.ledgerAddress) return [];

    return variantConfigs.flatMap((config) => [
      {
        address: protocol.addresses.ledgerAddress!,
        abi: ledgerAbi,
        functionName: "balanceOf" as const,
        args: [userAddress, config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.ledgerAddress!,
        abi: ledgerAbi,
        functionName: "redeemableBalanceOf" as const,
        args: [userAddress, config.trancheId] as const,
        chainId,
      },
      {
        address: protocol.addresses.ledgerAddress!,
        abi: ledgerAbi,
        functionName: "lockedBalanceOf" as const,
        args: [userAddress, config.trancheId] as const,
        chainId,
      },
    ]);
  }, [chainId, protocol.addresses.ledgerAddress, userAddress, variantConfigs]);

  const userLedgerReads = useReadContracts({
    allowFailure: true,
    contracts: userLedgerContracts,
    query: {
      enabled: userLedgerContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const rawRewardClaimableContracts = useMemo(() => {
    if (!userAddress) return [];

    return baseTranches.flatMap((tranche) =>
      tranche.rewardSinkAddress
        ? [
            {
              address: tranche.rewardSinkAddress,
              abi: rewardAccountingAbi,
              functionName: "claimableRewards" as const,
              args: [userAddress] as const,
              chainId,
            },
          ]
        : [],
    );
  }, [baseTranches, chainId, userAddress]);

  const rawRewardClaimableReads = useReadContracts({
    allowFailure: true,
    contracts: rawRewardClaimableContracts,
    query: {
      enabled: rawRewardClaimableContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const wrapperStaticContracts = useMemo(() => {
    return baseTranches.flatMap((tranche) =>
      tranche.wrapperAddress
        ? [
            {
              address: tranche.wrapperAddress,
              abi: auroveId20Abi,
              functionName: "backingBalance" as const,
              chainId,
            },
            {
              address: tranche.wrapperAddress,
              abi: auroveId20Abi,
              functionName: "isFullyBacked" as const,
              chainId,
            },
            {
              address: tranche.wrapperAddress,
              abi: auroveId20Abi,
              functionName: "rewardSink" as const,
              chainId,
            },
            {
              address: tranche.wrapperAddress,
              abi: auroveId20Abi,
              functionName: "auroveRewardSink" as const,
              chainId,
            },
          ]
        : [],
    );
  }, [baseTranches, chainId]);

  const wrapperStaticReads = useReadContracts({
    allowFailure: true,
    contracts: wrapperStaticContracts,
    query: {
      enabled: wrapperStaticContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const wrapperStaticSnapshots = useMemo(() => {
    const wrapperStaticData = wrapperStaticReads.data ?? [];
    let cursor = 0;

    return baseTranches.map((tranche) => {
      if (!tranche.wrapperAddress) {
        return {
          ...tranche,
          wrapperBackingBalanceRaw: 0n,
          wrapperIsFullyBacked: null,
          wrapperGaugeAddress: null,
          wrapperUpstreamRewardSinkAddress: null,
        };
      }

      const wrapperBackingBalanceRaw = readBigint(readResult(wrapperStaticData, cursor)) ?? 0n;
      const wrapperIsFullyBacked = readBoolean(readResult(wrapperStaticData, cursor + 1));
      const wrapperGaugeAddress = readAddress(readResult(wrapperStaticData, cursor + 2));
      const wrapperUpstreamRewardSinkAddress = readAddress(readResult(wrapperStaticData, cursor + 3));
      cursor += WRAPPER_STATIC_READS_PER_VARIANT;

      return {
        ...tranche,
        wrapperBackingBalanceRaw,
        wrapperIsFullyBacked,
        wrapperGaugeAddress,
        wrapperUpstreamRewardSinkAddress,
      };
    });
  }, [baseTranches, wrapperStaticReads.data]);

  const wrapperUserContracts = useMemo(() => {
    if (!userAddress) return [];

    return baseTranches.flatMap((tranche) =>
      tranche.wrapperAddress
        ? [
            {
              address: tranche.wrapperAddress,
              abi: auroveId20Abi,
              functionName: "balanceOf" as const,
              args: [userAddress] as const,
              chainId,
            },
          ]
        : [],
    );
  }, [baseTranches, chainId, userAddress]);

  const wrapperUserReads = useReadContracts({
    allowFailure: true,
    contracts: wrapperUserContracts,
    query: {
      enabled: wrapperUserContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const wrapperHarvestableContracts = useMemo(() => {
    return baseTranches.flatMap((tranche) =>
      tranche.wrapperAddress && tranche.rewardSinkAddress
        ? [
            {
              address: tranche.rewardSinkAddress,
              abi: rewardAccountingAbi,
              functionName: "claimableRewards" as const,
              args: [tranche.wrapperAddress] as const,
              chainId,
            },
          ]
        : [],
    );
  }, [baseTranches, chainId]);

  const wrapperHarvestableReads = useReadContracts({
    allowFailure: true,
    contracts: wrapperHarvestableContracts,
    query: {
      enabled: wrapperHarvestableContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const wrapperGaugeContracts = useMemo(() => {
    if (!userAddress) return [];

    return wrapperStaticSnapshots.flatMap((tranche) =>
      tranche.wrapperGaugeAddress
        ? [
            {
              address: tranche.wrapperGaugeAddress,
              abi: id20GaugeAbi,
              functionName: "accountMetadata" as const,
              args: [userAddress] as const,
              chainId,
            },
          ]
        : [],
    );
  }, [chainId, userAddress, wrapperStaticSnapshots]);

  const wrapperGaugeReads = useReadContracts({
    allowFailure: true,
    contracts: wrapperGaugeContracts,
    query: {
      enabled: wrapperGaugeContracts.length > 0,
      ...detailReadQueryOptions,
    },
  });

  const tranches = useMemo<EarnTrancheSnapshot[]>(() => {
    const userLedgerData = userLedgerReads.data ?? [];
    const rawRewardClaimableData = rawRewardClaimableReads.data ?? [];
    const wrapperUserData = wrapperUserReads.data ?? [];
    const wrapperHarvestableData = wrapperHarvestableReads.data ?? [];
    const wrapperGaugeData = wrapperGaugeReads.data ?? [];

    let userLedgerCursor = 0;
    let rawClaimableCursor = 0;
    let wrapperUserCursor = 0;
    let wrapperHarvestableCursor = 0;
    let wrapperGaugeCursor = 0;

    return wrapperStaticSnapshots.map((tranche) => {
      const nextTranche: EarnTrancheSnapshot = { ...tranche };

      if (userAddress) {
        nextTranche.userBalanceRaw = readBigint(readResult(userLedgerData, userLedgerCursor)) ?? 0n;
        nextTranche.redeemableBalanceRaw =
          readBigint(readResult(userLedgerData, userLedgerCursor + 1)) ?? 0n;
        nextTranche.lockedBalanceRaw =
          readBigint(readResult(userLedgerData, userLedgerCursor + 2)) ?? 0n;
        userLedgerCursor += USER_LEDGER_READS_PER_VARIANT;

        if (tranche.rewardSinkAddress) {
          nextTranche.rawRewardClaimableRaw =
            readBigint(readResult(rawRewardClaimableData, rawClaimableCursor)) ?? 0n;
          rawClaimableCursor += 1;
        }
      }

      if (tranche.wrapperAddress) {
        if (userAddress) {
          nextTranche.wrapperBalanceRaw =
            readBigint(readResult(wrapperUserData, wrapperUserCursor)) ?? 0n;
          wrapperUserCursor += 1;
        }

        if (nextTranche.rewardSinkAddress) {
          nextTranche.wrapperUpstreamClaimableRaw =
            readBigint(readResult(wrapperHarvestableData, wrapperHarvestableCursor)) ?? 0n;
          wrapperHarvestableCursor += 1;
        }

        if (nextTranche.wrapperGaugeAddress && userAddress) {
          const gaugeMetadata = parseGaugeMetadata(readResult(wrapperGaugeData, wrapperGaugeCursor));
          wrapperGaugeCursor += 1;
          nextTranche.wrapperIsActive = gaugeMetadata.isActive;
          nextTranche.wrapperWeightRaw = gaugeMetadata.weight;
          nextTranche.wrapperDebtRaw = gaugeMetadata.debt;
          nextTranche.wrapperCreditRaw = gaugeMetadata.credit;
          nextTranche.wrapperLentRaw = gaugeMetadata.lent;
          nextTranche.wrapperClaimableRaw = gaugeMetadata.accruedReward;
        }
      }

      return nextTranche;
    });
  }, [
    rawRewardClaimableReads.data,
    userAddress,
    userLedgerReads.data,
    wrapperGaugeReads.data,
    wrapperHarvestableReads.data,
    wrapperStaticSnapshots,
    wrapperUserReads.data,
  ]);

  const error =
    parseError(settlementReads.error, "Failed to read settlement window.") ||
    parseError(structuralReads.error, "Failed to read Earn tranche data.") ||
    parseError(userLedgerReads.error, "Failed to read tranche balances.") ||
    parseError(rawRewardClaimableReads.error, "Failed to read raw reward claimables.") ||
    parseError(wrapperStaticReads.error, "Failed to read wrapper state.") ||
    parseError(wrapperUserReads.error, "Failed to read wrapper balances.") ||
    parseError(wrapperHarvestableReads.error, "Failed to read wrapper harvestable rewards.") ||
    parseError(wrapperGaugeReads.error, "Failed to read wrapper gauge data.");

  const isLoading =
    settlementReads.isPending ||
    structuralReads.isPending ||
    userLedgerReads.isPending ||
    rawRewardClaimableReads.isPending ||
    wrapperStaticReads.isPending ||
    wrapperUserReads.isPending ||
    wrapperHarvestableReads.isPending ||
    wrapperGaugeReads.isPending;

  const isFetching =
    settlementReads.isFetching ||
    structuralReads.isFetching ||
    userLedgerReads.isFetching ||
    rawRewardClaimableReads.isFetching ||
    wrapperStaticReads.isFetching ||
    wrapperUserReads.isFetching ||
    wrapperHarvestableReads.isFetching ||
    wrapperGaugeReads.isFetching;

  return {
    protocol,
    variantConfigs,
    tranches,
    currentEpoch,
    settlementWindow,
    isSettlementWindowOpen,
    isConnected,
    isLoading,
    isFetching,
    error,
    refresh: () => {
      void settlementReads.refetch();
      void structuralReads.refetch();
      void userLedgerReads.refetch();
      void rawRewardClaimableReads.refetch();
      void wrapperStaticReads.refetch();
      void wrapperUserReads.refetch();
      void wrapperHarvestableReads.refetch();
      void wrapperGaugeReads.refetch();
    },
  };
}
