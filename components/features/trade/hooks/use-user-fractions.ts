"use client";

import { useMemo } from "react";
import { useEarnData } from "@/components/features/earn/use-earn-data";
import { formatRawTokenAmount } from "../helpers/formatters";

export type UserFractionPosition = {
  fractionAddress: `0x${string}`;
  trancheId: bigint;
  name: string;
  symbol: string;
  base: "veBTC" | "veMEZO" | "veAsset";
  balanceRaw: bigint;
  balanceFormatted: string;
};

export function useUserFractions() {
  const { userPositions, isLoading, isFetching, error, refresh } = useEarnData();

  const positions = useMemo<UserFractionPosition[]>(() => {
    return userPositions.map((position) => ({
      fractionAddress: position.fractionAddress,
      trancheId: position.trancheId,
      name: position.name,
      symbol: position.symbol,
      base: position.variant,
      balanceRaw: position.userBalanceRaw,
      balanceFormatted: formatRawTokenAmount(position.userBalanceRaw, 18),
    }));
  }, [userPositions]);

  return {
    positions,
    isLoading,
    isFetching,
    error,
    refresh,
  };
}
