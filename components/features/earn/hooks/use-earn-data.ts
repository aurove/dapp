"use client";

import { useMemo } from "react";
import { erc20Abi, type Abi, type Address } from "viem";
import { useAccount, useBlock, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import {
  calculateVirtualAprPct,
  decodeTrancheId,
  lifecycleFromValue,
  type EarnAssetId,
  type EarnLifecycle,
} from "../utils";

type ReadPlanItem<TKind extends string> = {
  kind: TKind;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  chainId: number;
};

type ReadEntry = {
  status?: "success" | "failure";
  result?: unknown;
};

type AssetInfoKind = "allowed" | "underlying" | "veName" | "veSymbol";
type TokenInfoKind = "symbol" | "decimals" | "balance" | "allowance";
type FractionIdentityKind =
  | "name"
  | "symbol"
  | "trancheId"
  | "decimals"
  | "veNFT"
  | "targetEnd"
  | "lifecycle"
  | "settledUnderlying"
  | "rewardRate"
  | "rewardReserve"
  | "undistributedRewards"
  | "relockWindow"
  | "heldCount"
  | "heldTokenIds"
  | "rewardAsset";
type FractionDetailKind =
  | "totalSupply"
  | "userBalance"
  | "claimable"
  | "unsettledBalance"
  | "settledBalance"
  | "withdrawableBalance";

export type EarnAssetOption = {
  id: EarnAssetId;
  label: string;
  veAddress: Address;
  veAbi: Abi;
  enabled: boolean;
  variant: number | null;
  underlyingToken: Address | null;
  underlyingSymbol: string;
  underlyingDecimals: number;
  walletBalanceRaw: bigint;
  allowanceRaw: bigint;
};

export type EarnVaultLock = {
  tokenId: bigint;
  amountRaw: bigint;
  end: bigint;
  isPermanent: boolean;
  isExpired: boolean;
};

export type EarnVault = {
  address: Address;
  name: string;
  symbol: string;
  trancheId: bigint;
  trancheNumber: number | null;
  assetId: EarnAssetId | null;
  decimals: number;
  veNft: Address | null;
  lifecycle: EarnLifecycle;
  targetEnd: bigint | null;
  settlementCloseAt: bigint | null;
  settledUnderlyingRaw: bigint;
  rewardRateRaw: bigint;
  rewardReserveRaw: bigint;
  undistributedRewardsRaw: bigint;
  totalSupplyRaw: bigint;
  userBalanceRaw: bigint;
  claimableRewardsRaw: bigint;
  unsettledBalanceRaw: bigint | null;
  settledBalanceRaw: bigint | null;
  withdrawableBalanceRaw: bigint | null;
  rewardAsset: Address | null;
  rewardSymbol: string;
  rewardDecimals: number;
  heldCount: bigint;
  heldTokenIds: bigint[];
  locks: EarnVaultLock[];
  expiredHeldTokenIds: bigint[];
  virtualAprPct: number | null;
  hasUserPosition: boolean;
};

export type EarnPortfolioSummary = {
  vaultCount: number;
  positionCount: number;
  claimableCount: number;
  withdrawableCount: number;
  nextSettlementAt: bigint | null;
};

function readResult(data: readonly ReadEntry[] | undefined, index: number): unknown {
  const entry = data?.[index];
  return entry?.status === "success" ? entry.result : undefined;
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function toAddress(value: unknown): Address | null {
  return isAddress(value) ? value : null;
}

function toBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function addressKey(address: Address): string {
  return address.toLowerCase();
}

function buildRead<TKind extends string>(
  item: ReadPlanItem<TKind>,
): {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  chainId: number;
} {
  return {
    address: item.address,
    abi: item.abi,
    functionName: item.functionName,
    args: item.args,
    chainId: item.chainId,
  };
}

function parseAllowedVeNft(value: unknown): { enabled: boolean; variant: number | null } {
  if (Array.isArray(value)) {
    return {
      variant: typeof value[0] === "number" ? value[0] : toNumber(value[0], 0),
      enabled: value[1] === true,
    };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      variant: "variant" in record ? toNumber(record.variant, 0) : null,
      enabled: record.enabled === true,
    };
  }

  return { enabled: false, variant: null };
}

function toBigIntArray(value: unknown): bigint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toBigInt(entry, -1n)).filter((entry) => entry >= 0n);
}

function parseLock(value: unknown, tokenId: bigint, nowTimestamp: number): EarnVaultLock | null {
  const record = value as Record<string, unknown> | undefined;
  const tuple = Array.isArray(value) ? value : null;
  const amount = toBigInt(record?.amount ?? tuple?.[0] ?? 0n);
  const end = toBigInt(record?.end ?? tuple?.[1] ?? 0n);
  const isPermanent = Boolean(record?.isPermanent ?? tuple?.[2] ?? false);

  if (amount <= 0n && end <= 0n) return null;

  return {
    tokenId,
    amountRaw: amount > 0n ? amount : 0n,
    end,
    isPermanent,
    isExpired: !isPermanent && end > 0n && end <= BigInt(nowTimestamp),
  };
}

export function useEarnData() {
  const { address: userAddress, isConnected } = useAccount();
  const walletChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const expectedChainId = activeChain.id;
  const isCorrectNetwork = walletChainId === expectedChainId;

  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");
  const assetFraction = getContractConfig(expectedChainId, "AssetFraction");
  const veBtc = getContractConfig(expectedChainId, "VeBTC");
  const veMezo = getContractConfig(expectedChainId, "VeMEZO");

  const assetConfigs = useMemo(
    () =>
      [
        veBtc?.address && veBtc.abi
          ? { id: "veBTC" as const, label: "veBTC", veAddress: veBtc.address, veAbi: veBtc.abi }
          : null,
        veMezo?.address && veMezo.abi
          ? {
              id: "veMEZO" as const,
              label: "veMEZO",
              veAddress: veMezo.address,
              veAbi: veMezo.abi,
            }
          : null,
      ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    [veBtc, veMezo],
  );

  const blockRead = useBlock({
    chainId: expectedChainId,
    watch: true,
    query: {
      staleTime: 10_000,
    },
  });
  const nowTimestamp =
    typeof blockRead.data?.timestamp === "bigint"
      ? Number(blockRead.data.timestamp)
      : Math.floor(Date.now() / 1000);

  const assetInfoPlan = useMemo(() => {
    const plan: Array<ReadPlanItem<AssetInfoKind> & { assetId: EarnAssetId }> = [];
    if (!assetLedger?.address || !assetLedger.abi) return plan;

    for (const asset of assetConfigs) {
      plan.push({
        assetId: asset.id,
        kind: "allowed",
        address: assetLedger.address,
        abi: assetLedger.abi,
        functionName: "allowedVeNfts",
        args: [asset.veAddress],
        chainId: expectedChainId,
      });
      plan.push({
        assetId: asset.id,
        kind: "underlying",
        address: asset.veAddress,
        abi: asset.veAbi,
        functionName: "token",
        chainId: expectedChainId,
      });
      plan.push({
        assetId: asset.id,
        kind: "veName",
        address: asset.veAddress,
        abi: asset.veAbi,
        functionName: "name",
        chainId: expectedChainId,
      });
      plan.push({
        assetId: asset.id,
        kind: "veSymbol",
        address: asset.veAddress,
        abi: asset.veAbi,
        functionName: "symbol",
        chainId: expectedChainId,
      });
    }

    return plan;
  }, [assetConfigs, assetLedger, expectedChainId]);

  const assetInfoReads = useReadContracts({
    allowFailure: true,
    contracts: assetInfoPlan.map(buildRead),
    query: {
      enabled: assetInfoPlan.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const baseAssetOptions = useMemo(() => {
    const byId = new Map<EarnAssetId, Partial<EarnAssetOption>>();
    for (const asset of assetConfigs) {
      byId.set(asset.id, {
        id: asset.id,
        label: asset.label,
        veAddress: asset.veAddress,
        veAbi: asset.veAbi,
        enabled: false,
        variant: null,
        underlyingToken: null,
        underlyingSymbol: asset.label,
        underlyingDecimals: 18,
        walletBalanceRaw: 0n,
        allowanceRaw: 0n,
      });
    }

    assetInfoPlan.forEach((item, index) => {
      const current = byId.get(item.assetId);
      if (!current) return;
      const value = readResult(assetInfoReads.data as readonly ReadEntry[] | undefined, index);

      if (item.kind === "allowed") {
        const allowed = parseAllowedVeNft(value);
        current.enabled = allowed.enabled;
        current.variant = allowed.variant;
      }

      if (item.kind === "underlying") {
        current.underlyingToken = toAddress(value);
      }

      if (item.kind === "veSymbol") {
        current.label = toStringValue(value, current.label ?? item.assetId);
      }
    });

    return [...byId.values()].filter((entry): entry is EarnAssetOption =>
      Boolean(entry.id && entry.label && entry.veAddress && entry.veAbi),
    );
  }, [assetConfigs, assetInfoPlan, assetInfoReads.data]);

  const assetTokenPlan = useMemo(() => {
    const plan: Array<ReadPlanItem<TokenInfoKind> & { assetId: EarnAssetId }> = [];
    if (!assetLedger?.address) return plan;

    for (const asset of baseAssetOptions) {
      if (!asset.underlyingToken) continue;

      plan.push({
        assetId: asset.id,
        kind: "symbol",
        address: asset.underlyingToken,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: expectedChainId,
      });
      plan.push({
        assetId: asset.id,
        kind: "decimals",
        address: asset.underlyingToken,
        abi: erc20Abi,
        functionName: "decimals",
        chainId: expectedChainId,
      });

      if (userAddress) {
        plan.push({
          assetId: asset.id,
          kind: "balance",
          address: asset.underlyingToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
          chainId: expectedChainId,
        });
        plan.push({
          assetId: asset.id,
          kind: "allowance",
          address: asset.underlyingToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [userAddress, assetLedger.address],
          chainId: expectedChainId,
        });
      }
    }

    return plan;
  }, [assetLedger?.address, baseAssetOptions, expectedChainId, userAddress]);

  const assetTokenReads = useReadContracts({
    allowFailure: true,
    contracts: assetTokenPlan.map(buildRead),
    query: {
      enabled: assetTokenPlan.length > 0,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: isConnected ? 20_000 : false,
    },
  });

  const assetOptions = useMemo(() => {
    const byId = new Map<EarnAssetId, EarnAssetOption>(
      baseAssetOptions.map((asset) => [asset.id, { ...asset }]),
    );

    assetTokenPlan.forEach((item, index) => {
      const current = byId.get(item.assetId);
      if (!current) return;
      const value = readResult(assetTokenReads.data as readonly ReadEntry[] | undefined, index);

      if (item.kind === "symbol") current.underlyingSymbol = toStringValue(value, current.label);
      if (item.kind === "decimals") current.underlyingDecimals = toNumber(value, 18);
      if (item.kind === "balance") current.walletBalanceRaw = toBigInt(value);
      if (item.kind === "allowance") current.allowanceRaw = toBigInt(value);
    });

    return [...byId.values()];
  }, [assetTokenPlan, assetTokenReads.data, baseAssetOptions]);

  const fractionCountRead = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi
        ? [
            {
              address: assetLedger.address,
              abi: assetLedger.abi,
              functionName: "assetFractionCount",
              chainId: expectedChainId,
            },
          ]
        : [],
    query: {
      enabled: Boolean(assetLedger?.address && assetLedger.abi),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionCount = toNumber(
    readResult(fractionCountRead.data as readonly ReadEntry[] | undefined, 0),
    0,
  );

  const fractionAddressPlan = useMemo(() => {
    if (!assetLedger?.address || !assetLedger.abi || fractionCount <= 0) return [];
    return Array.from({ length: fractionCount }, (_, index) => ({
      address: assetLedger.address,
      abi: assetLedger.abi,
      functionName: "assetFractionAt",
      args: [BigInt(index)] as const,
      chainId: expectedChainId,
    }));
  }, [assetLedger, expectedChainId, fractionCount]);

  const fractionAddressReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddressPlan,
    query: {
      enabled: fractionAddressPlan.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionAddresses = useMemo(
    () =>
      (fractionAddressReads.data as readonly ReadEntry[] | undefined)?.reduce<Address[]>(
        (acc, _entry, index) => {
          const address = toAddress(
            readResult(fractionAddressReads.data as readonly ReadEntry[] | undefined, index),
          );
          if (address) acc.push(address);
          return acc;
        },
        [],
      ) ?? [],
    [fractionAddressReads.data],
  );

  const fractionIdentityPlan = useMemo(() => {
    const plan: Array<ReadPlanItem<FractionIdentityKind> & { fractionAddress: Address }> = [];
    if (!assetFraction?.abi) return plan;

    const push = (fractionAddress: Address, kind: FractionIdentityKind, functionName: string) => {
      plan.push({
        fractionAddress,
        kind,
        address: fractionAddress,
        abi: assetFraction.abi,
        functionName,
        chainId: expectedChainId,
      });
    };

    for (const fractionAddress of fractionAddresses) {
      push(fractionAddress, "name", "name");
      push(fractionAddress, "symbol", "symbol");
      push(fractionAddress, "trancheId", "trancheId");
      push(fractionAddress, "decimals", "decimals");
      push(fractionAddress, "veNFT", "veNFT");
      push(fractionAddress, "targetEnd", "targetEnd");
      push(fractionAddress, "lifecycle", "lifecycleState");
      push(fractionAddress, "settledUnderlying", "settledUnderlying");
      push(fractionAddress, "rewardRate", "rewardRate");
      push(fractionAddress, "rewardReserve", "rewardReserve");
      push(fractionAddress, "undistributedRewards", "undistributedRewards");
      push(fractionAddress, "relockWindow", "RELOCK_INVALID_WINDOW");
      push(fractionAddress, "heldCount", "heldVeNftCount");
      push(fractionAddress, "heldTokenIds", "allHeldVeNfts");
      push(fractionAddress, "rewardAsset", "rewardAsset");
    }

    return plan;
  }, [assetFraction?.abi, expectedChainId, fractionAddresses]);

  const fractionIdentityReads = useReadContracts({
    allowFailure: true,
    contracts: fractionIdentityPlan.map(buildRead),
    query: {
      enabled: fractionIdentityPlan.length > 0,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
    },
  });

  const fractionBases = useMemo(() => {
    const byAddress = new Map<
      string,
      Partial<EarnVault> & {
        address: Address;
        relockWindowRaw?: bigint;
      }
    >();

    for (const address of fractionAddresses) {
      byAddress.set(addressKey(address), {
        address,
        name: `${address.slice(0, 6)}...${address.slice(-4)}`,
        symbol: "FRACTION",
        trancheId: 0n,
        trancheNumber: null,
        assetId: null,
        decimals: 18,
        veNft: null,
        lifecycle: "active",
        targetEnd: null,
        settlementCloseAt: null,
        settledUnderlyingRaw: 0n,
        rewardRateRaw: 0n,
        rewardReserveRaw: 0n,
        undistributedRewardsRaw: 0n,
        totalSupplyRaw: 0n,
        userBalanceRaw: 0n,
        claimableRewardsRaw: 0n,
        unsettledBalanceRaw: null,
        settledBalanceRaw: null,
        withdrawableBalanceRaw: null,
        rewardAsset: null,
        rewardSymbol: "TOKEN",
        rewardDecimals: 18,
        heldCount: 0n,
        heldTokenIds: [],
        locks: [],
        expiredHeldTokenIds: [],
        virtualAprPct: null,
        hasUserPosition: false,
        relockWindowRaw: 0n,
      });
    }

    fractionIdentityPlan.forEach((item, index) => {
      const current = byAddress.get(addressKey(item.fractionAddress));
      if (!current) return;
      const value = readResult(
        fractionIdentityReads.data as readonly ReadEntry[] | undefined,
        index,
      );

      if (item.kind === "name") current.name = toStringValue(value, current.name ?? "Vault");
      if (item.kind === "symbol")
        current.symbol = toStringValue(value, current.symbol ?? "FRACTION");
      if (item.kind === "trancheId") {
        const trancheId = toBigInt(value);
        const decoded = decodeTrancheId(trancheId);
        current.trancheId = trancheId;
        current.assetId = decoded?.assetId ?? null;
        current.trancheNumber = decoded?.trancheNumber ?? null;
      }
      if (item.kind === "decimals") current.decimals = toNumber(value, 18);
      if (item.kind === "veNFT") current.veNft = toAddress(value);
      if (item.kind === "targetEnd") current.targetEnd = toBigInt(value);
      if (item.kind === "lifecycle") current.lifecycle = lifecycleFromValue(toNumber(value, 0));
      if (item.kind === "settledUnderlying") current.settledUnderlyingRaw = toBigInt(value);
      if (item.kind === "rewardRate") current.rewardRateRaw = toBigInt(value);
      if (item.kind === "rewardReserve") current.rewardReserveRaw = toBigInt(value);
      if (item.kind === "undistributedRewards") current.undistributedRewardsRaw = toBigInt(value);
      if (item.kind === "relockWindow") current.relockWindowRaw = toBigInt(value);
      if (item.kind === "heldCount") current.heldCount = toBigInt(value);
      if (item.kind === "heldTokenIds") current.heldTokenIds = toBigIntArray(value);
      if (item.kind === "rewardAsset") current.rewardAsset = toAddress(value);
    });

    return [...byAddress.values()].map((entry) => {
      const targetEnd = entry.targetEnd && entry.targetEnd > 0n ? entry.targetEnd : null;
      const relockWindow = entry.relockWindowRaw ?? 0n;
      return {
        ...entry,
        targetEnd,
        settlementCloseAt: targetEnd && relockWindow > 0n ? targetEnd + relockWindow : null,
      } as EarnVault & { relockWindowRaw?: bigint };
    });
  }, [fractionAddresses, fractionIdentityPlan, fractionIdentityReads.data]);

  const fractionDetailPlan = useMemo(() => {
    const plan: Array<ReadPlanItem<FractionDetailKind> & { fractionAddress: Address }> = [];
    if (!assetLedger?.address || !assetLedger.abi || !assetFraction?.abi) return plan;

    for (const fraction of fractionBases) {
      if (fraction.trancheId <= 0n) continue;

      plan.push({
        fractionAddress: fraction.address,
        kind: "totalSupply",
        address: assetLedger.address,
        abi: assetLedger.abi,
        functionName: "totalSupply",
        args: [fraction.trancheId],
        chainId: expectedChainId,
      });

      if (!userAddress) continue;

      plan.push({
        fractionAddress: fraction.address,
        kind: "userBalance",
        address: assetLedger.address,
        abi: assetLedger.abi,
        functionName: "balanceOf",
        args: [userAddress, fraction.trancheId],
        chainId: expectedChainId,
      });
      plan.push({
        fractionAddress: fraction.address,
        kind: "claimable",
        address: fraction.address,
        abi: assetFraction.abi,
        functionName: "claimableRewards",
        args: [userAddress],
        chainId: expectedChainId,
      });
      plan.push({
        fractionAddress: fraction.address,
        kind: "unsettledBalance",
        address: fraction.address,
        abi: assetFraction.abi,
        functionName: "unsettledBalanceOf",
        args: [userAddress],
        chainId: expectedChainId,
      });
      plan.push({
        fractionAddress: fraction.address,
        kind: "settledBalance",
        address: fraction.address,
        abi: assetFraction.abi,
        functionName: "settledBalanceOf",
        args: [userAddress],
        chainId: expectedChainId,
      });
      plan.push({
        fractionAddress: fraction.address,
        kind: "withdrawableBalance",
        address: fraction.address,
        abi: assetFraction.abi,
        functionName: "withdrawableBalanceOf",
        args: [userAddress],
        chainId: expectedChainId,
      });
    }

    return plan;
  }, [assetFraction?.abi, assetLedger, expectedChainId, fractionBases, userAddress]);

  const fractionDetailReads = useReadContracts({
    allowFailure: true,
    contracts: fractionDetailPlan.map(buildRead),
    query: {
      enabled: fractionDetailPlan.length > 0,
      staleTime: 12_000,
      gcTime: 5 * 60_000,
      refetchInterval: isConnected ? 20_000 : false,
    },
  });

  const rewardTokenPlan = useMemo(() => {
    const tokens = new Map<string, Address>();
    for (const fraction of fractionBases) {
      if (fraction.rewardAsset) tokens.set(addressKey(fraction.rewardAsset), fraction.rewardAsset);
    }

    const plan: Array<ReadPlanItem<TokenInfoKind> & { tokenAddress: Address }> = [];
    for (const tokenAddress of tokens.values()) {
      plan.push({
        tokenAddress,
        kind: "symbol",
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
        chainId: expectedChainId,
      });
      plan.push({
        tokenAddress,
        kind: "decimals",
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
        chainId: expectedChainId,
      });
    }

    return plan;
  }, [expectedChainId, fractionBases]);

  const rewardTokenReads = useReadContracts({
    allowFailure: true,
    contracts: rewardTokenPlan.map(buildRead),
    query: {
      enabled: rewardTokenPlan.length > 0,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  });

  const rewardTokenMeta = useMemo(() => {
    const byAddress = new Map<string, { symbol: string; decimals: number }>();
    rewardTokenPlan.forEach((item, index) => {
      const key = addressKey(item.tokenAddress);
      const current = byAddress.get(key) ?? { symbol: "TOKEN", decimals: 18 };
      const value = readResult(rewardTokenReads.data as readonly ReadEntry[] | undefined, index);
      if (item.kind === "symbol") current.symbol = toStringValue(value, current.symbol);
      if (item.kind === "decimals") current.decimals = toNumber(value, 18);
      byAddress.set(key, current);
    });
    return byAddress;
  }, [rewardTokenPlan, rewardTokenReads.data]);

  const veAbiByAddress = useMemo(() => {
    const byAddress = new Map<string, Abi>();
    for (const asset of assetConfigs) byAddress.set(addressKey(asset.veAddress), asset.veAbi);
    return byAddress;
  }, [assetConfigs]);

  const lockPlan = useMemo(() => {
    const plan: Array<ReadPlanItem<"locked"> & { fractionAddress: Address; tokenId: bigint }> = [];

    for (const fraction of fractionBases) {
      if (!fraction.veNft) continue;
      const veAbi = veAbiByAddress.get(addressKey(fraction.veNft));
      if (!veAbi) continue;

      for (const tokenId of fraction.heldTokenIds) {
        plan.push({
          fractionAddress: fraction.address,
          tokenId,
          kind: "locked",
          address: fraction.veNft,
          abi: veAbi,
          functionName: "locked",
          args: [tokenId],
          chainId: expectedChainId,
        });
      }
    }

    return plan;
  }, [expectedChainId, fractionBases, veAbiByAddress]);

  const lockReads = useReadContracts({
    allowFailure: true,
    contracts: lockPlan.map(buildRead),
    query: {
      enabled: lockPlan.length > 0,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
    },
  });

  const locksByVault = useMemo(() => {
    const byVault = new Map<string, EarnVaultLock[]>();
    lockPlan.forEach((item, index) => {
      const value = readResult(lockReads.data as readonly ReadEntry[] | undefined, index);
      const lock = parseLock(value, item.tokenId, nowTimestamp);
      if (!lock) return;

      const key = addressKey(item.fractionAddress);
      const current = byVault.get(key) ?? [];
      current.push(lock);
      byVault.set(key, current);
    });
    return byVault;
  }, [lockPlan, lockReads.data, nowTimestamp]);

  const vaults = useMemo(() => {
    const byAddress = new Map<string, EarnVault>(
      fractionBases.map((fraction) => [
        addressKey(fraction.address),
        {
          ...fraction,
          locks: locksByVault.get(addressKey(fraction.address)) ?? [],
          expiredHeldTokenIds: [],
        },
      ]),
    );

    fractionDetailPlan.forEach((item, index) => {
      const current = byAddress.get(addressKey(item.fractionAddress));
      if (!current) return;
      const value = readResult(fractionDetailReads.data as readonly ReadEntry[] | undefined, index);

      if (item.kind === "totalSupply") current.totalSupplyRaw = toBigInt(value);
      if (item.kind === "userBalance") current.userBalanceRaw = toBigInt(value);
      if (item.kind === "claimable") current.claimableRewardsRaw = toBigInt(value);
      if (item.kind === "unsettledBalance") current.unsettledBalanceRaw = toBigInt(value);
      if (item.kind === "settledBalance") current.settledBalanceRaw = toBigInt(value);
      if (item.kind === "withdrawableBalance") current.withdrawableBalanceRaw = toBigInt(value);
    });

    return [...byAddress.values()]
      .map((vault) => {
        const rewardMeta = vault.rewardAsset
          ? rewardTokenMeta.get(addressKey(vault.rewardAsset))
          : null;
        const locks = locksByVault.get(addressKey(vault.address)) ?? [];
        const expiredHeldTokenIds = locks
          .filter((lock) => lock.isExpired)
          .map((lock) => lock.tokenId);

        return {
          ...vault,
          rewardSymbol: rewardMeta?.symbol ?? vault.rewardSymbol,
          rewardDecimals: rewardMeta?.decimals ?? vault.rewardDecimals,
          locks,
          expiredHeldTokenIds,
          virtualAprPct: calculateVirtualAprPct(vault.rewardRateRaw, vault.totalSupplyRaw),
          hasUserPosition: vault.userBalanceRaw > 0n,
        };
      })
      .sort((left, right) => {
        if (left.hasUserPosition !== right.hasUserPosition) return left.hasUserPosition ? -1 : 1;
        if (left.lifecycle !== right.lifecycle) {
          if (left.lifecycle === "settlement") return -1;
          if (right.lifecycle === "settlement") return 1;
        }
        if (left.totalSupplyRaw !== right.totalSupplyRaw) {
          return left.totalSupplyRaw > right.totalSupplyRaw ? -1 : 1;
        }
        return left.symbol.localeCompare(right.symbol);
      });
  }, [fractionBases, fractionDetailPlan, fractionDetailReads.data, locksByVault, rewardTokenMeta]);

  const portfolioSummary = useMemo<EarnPortfolioSummary>(() => {
    const activeTargets = vaults
      .map((vault) => vault.targetEnd)
      .filter((value): value is bigint => Boolean(value && value > BigInt(nowTimestamp)))
      .sort((left, right) => (left < right ? -1 : 1));

    return {
      vaultCount: vaults.length,
      positionCount: vaults.filter((vault) => vault.userBalanceRaw > 0n).length,
      claimableCount: vaults.filter((vault) => vault.claimableRewardsRaw > 0n).length,
      withdrawableCount: vaults.filter((vault) => (vault.withdrawableBalanceRaw ?? 0n) > 0n).length,
      nextSettlementAt: activeTargets[0] ?? null,
    };
  }, [nowTimestamp, vaults]);

  function refresh() {
    void assetInfoReads.refetch();
    void assetTokenReads.refetch();
    void fractionCountRead.refetch();
    void fractionAddressReads.refetch();
    void fractionIdentityReads.refetch();
    void fractionDetailReads.refetch();
    void rewardTokenReads.refetch();
    void lockReads.refetch();
    void blockRead.refetch();
  }

  const error =
    (assetInfoReads.error as Error | null) ||
    (assetTokenReads.error as Error | null) ||
    (fractionCountRead.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionIdentityReads.error as Error | null) ||
    (fractionDetailReads.error as Error | null) ||
    (rewardTokenReads.error as Error | null) ||
    (lockReads.error as Error | null) ||
    null;

  return {
    activeChain,
    assetLedger,
    assetFraction,
    assetOptions,
    blockTimestamp: nowTimestamp,
    error,
    expectedChainId,
    isConnected,
    isCorrectNetwork,
    isFetching:
      assetInfoReads.isFetching ||
      assetTokenReads.isFetching ||
      fractionCountRead.isFetching ||
      fractionAddressReads.isFetching ||
      fractionIdentityReads.isFetching ||
      fractionDetailReads.isFetching ||
      rewardTokenReads.isFetching ||
      lockReads.isFetching,
    isLoading:
      assetInfoReads.isPending ||
      fractionCountRead.isPending ||
      fractionAddressReads.isPending ||
      fractionIdentityReads.isPending,
    portfolioSummary,
    refresh,
    userAddress,
    vaults,
  };
}
