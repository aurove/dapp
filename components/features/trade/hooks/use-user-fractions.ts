"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { useAccount, useChainId, useReadContracts } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { getActiveChain, resolveAppEnvironment } from "@/lib/config/chains";
import { formatRawTokenAmount } from "../helpers/formatters";

export type UserFractionPosition = {
  fractionAddress: Address;
  trancheId: bigint;
  name: string;
  symbol: string;
  base: "veBTC" | "veMEZO" | "veAsset";
  balanceRaw: bigint;
  balanceFormatted: string;
};

function inferFractionBase(symbol: string): "veBTC" | "veMEZO" | "veAsset" {
  const normalized = symbol.toLowerCase();
  if (normalized.startsWith("fvebtc")) return "veBTC";
  if (normalized.startsWith("fvemezo")) return "veMEZO";
  return "veAsset";
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) return null;
  return value as Address;
}

export function useUserFractions() {
  const { address: userAddress } = useAccount();
  const txFlowChainId = useChainId();
  const activeChain = getActiveChain(resolveAppEnvironment());
  const chainId = txFlowChainId ?? activeChain.id;

  const assetLedger = getContractConfig(chainId, "AssetLedger");
  const assetFractionAbi = getContractConfig(chainId, "AssetFraction")?.abi;

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
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionCountResult = countRead.data?.[0]?.result;
  const fractionCount =
    typeof fractionCountResult === "bigint"
      ? Number(fractionCountResult)
      : typeof fractionCountResult === "number"
        ? fractionCountResult
        : 0;

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
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractionAddresses = useMemo(
    () =>
      (fractionAddressReads.data ?? [])
        .map((entry) => asAddress(entry.result))
        .filter((value): value is Address => Boolean(value)),
    [fractionAddressReads.data],
  );

  const fractionMetaReads = useReadContracts({
    allowFailure: true,
    contracts: fractionAddresses.flatMap((address) => [
      {
        address,
        abi: assetFractionAbi,
        functionName: "symbol",
        chainId,
      },
      {
        address,
        abi: assetFractionAbi,
        functionName: "name",
        chainId,
      },
      {
        address,
        abi: assetFractionAbi,
        functionName: "trancheId",
        chainId,
      },
    ]),
    query: {
      enabled: fractionAddresses.length > 0,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const fractions = useMemo(() => {
    return fractionAddresses.map((fractionAddress, index) => {
      const cursor = index * 3;
      const symbolResult = fractionMetaReads.data?.[cursor]?.result;
      const nameResult = fractionMetaReads.data?.[cursor + 1]?.result;
      const trancheResult = fractionMetaReads.data?.[cursor + 2]?.result;
      const symbol =
        typeof symbolResult === "string" && symbolResult.trim().length > 0
          ? symbolResult.trim()
          : `${fractionAddress.slice(0, 6)}...${fractionAddress.slice(-4)}`;
      const name =
        typeof nameResult === "string" && nameResult.trim().length > 0 ? nameResult.trim() : symbol;
      return {
        fractionAddress,
        name,
        symbol,
        trancheId: typeof trancheResult === "bigint" ? trancheResult : 0n,
        base: inferFractionBase(symbol),
      };
    });
  }, [fractionAddresses, fractionMetaReads.data]);

  const balancesRead = useReadContracts({
    allowFailure: true,
    contracts:
      assetLedger?.address && assetLedger.abi && userAddress
        ? fractions.map((fraction) => ({
            address: assetLedger.address,
            abi: assetLedger.abi,
            functionName: "balanceOf",
            args: [userAddress, fraction.trancheId],
            chainId,
          }))
        : [],
    query: {
      enabled:
        Boolean(assetLedger?.address && assetLedger.abi && userAddress) && fractions.length > 0,
      staleTime: 20_000,
      gcTime: 5 * 60_000,
    },
  });

  const positions = useMemo<UserFractionPosition[]>(() => {
    return fractions
      .map((fraction, index) => {
        const balanceResult = balancesRead.data?.[index]?.result;
        const balanceRaw = typeof balanceResult === "bigint" ? balanceResult : 0n;
        return {
          ...fraction,
          balanceRaw,
          balanceFormatted: formatRawTokenAmount(balanceRaw, 18),
        };
      })
      .filter((position) => position.balanceRaw > 0n);
  }, [balancesRead.data, fractions]);

  function refresh() {
    void countRead.refetch();
    void fractionAddressReads.refetch();
    void fractionMetaReads.refetch();
    void balancesRead.refetch();
  }

  const error =
    (countRead.error as Error | null) ||
    (fractionAddressReads.error as Error | null) ||
    (fractionMetaReads.error as Error | null) ||
    (balancesRead.error as Error | null) ||
    null;

  return {
    positions,
    isLoading:
      countRead.isPending ||
      fractionAddressReads.isPending ||
      fractionMetaReads.isPending ||
      balancesRead.isPending,
    isFetching:
      countRead.isFetching ||
      fractionAddressReads.isFetching ||
      fractionMetaReads.isFetching ||
      balancesRead.isFetching,
    error,
    refresh,
  };
}
