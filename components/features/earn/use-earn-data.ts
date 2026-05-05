"use client";

import { useMemo } from "react";
import { erc20Abi, type Abi, type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
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
  rewardAsset: Address | null;
  rewardSymbol: string | null;
  rewardDecimals: number;
  rewardReserveRaw: bigint | null;
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

  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi as Abi | undefined;
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
      staleTime: 20_000,
      gcTime: 5 * 60_000,
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
      staleTime: 20_000,
      gcTime: 5 * 60_000,
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
              functionName: "balanceOf",
              args: [userAddress],
              chainId,
            },
            {
              address,
              abi: assetFractionAbi,
              functionName: "claimableRewards",
              args: [userAddress],
              chainId,
            },
          ]
        : []),
    ]),
    query: {
      enabled: Boolean(assetFractionAbi) && fractionAddresses.length > 0,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
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
      staleTime: 60_000,
      gcTime: 5 * 60_000,
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
      staleTime: 60_000,
      gcTime: 5 * 60_000,
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
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchInterval: 30_000,
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
              : null);
        if (!variant || (variant !== "veBTC" && variant !== "veMEZO")) return null;

        const offset = index * rowSize;
        const rewardAsset = asAddress(fractionReads.data?.[offset + 11]?.result);
        const rewardMeta = rewardAsset ? rewardTokenMeta.get(rewardAsset.toLowerCase()) : null;

        return {
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
          settledUnderlyingRaw: asBigint(fractionReads.data?.[offset + 13]?.result),
          userBalanceRaw: asBigint(fractionReads.data?.[offset + 14]?.result) ?? 0n,
          claimableRewardsRaw: asBigint(fractionReads.data?.[offset + 15]?.result) ?? 0n,
        };
      })
      .filter((product): product is EarnProduct => Boolean(product))
      .sort((a, b) => a.variant.localeCompare(b.variant) || a.trancheNumber - b.trancheNumber);
  }, [fractionCore, fractionReads.data, rewardTokenMeta, rowSize, veBtc?.address, veMezo?.address]);

  const visibleProducts = useMemo(() => {
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
      rewardAsset: null,
      rewardSymbol: null,
      rewardDecimals: 18,
      rewardReserveRaw: null,
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
    void rewardTokenReads.refetch();
    void tokenAddressReads.refetch();
    void tokenMetaReads.refetch();
  }

  const error =
    (countRead.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionReads.error as Error | null) ||
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
      countRead.isPending ||
      fractionAddressReads.isPending ||
      fractionReads.isPending ||
      tokenAddressReads.isPending ||
      tokenMetaReads.isPending,
    isFetching:
      countRead.isFetching ||
      fractionAddressReads.isFetching ||
      fractionReads.isFetching ||
      rewardTokenReads.isFetching ||
      tokenAddressReads.isFetching ||
      tokenMetaReads.isFetching,
    error,
    refresh,
  };
}
