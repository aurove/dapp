"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import type { GaugeIncentiveTarget } from "@/lib/config/supported-liquidity-pools";
import { gaugeIncentiveKeys } from "./gauge-incentive-model";
import { fetchGaugeIncentiveData } from "./gauge-incentive-data";
export {
  fetchGaugeIncentiveData,
  readGaugeIncentiveTargetStatus,
  filterAcceptedGaugeIncentiveTokens,
} from "./gauge-incentive-data";
export type { GaugeIncentiveData, GaugeIncentiveToken } from "./gauge-incentive-data";

export function useGaugeIncentiveData(target: GaugeIncentiveTarget, open: boolean) {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: gaugeIncentiveKeys.data(chainId, target.gaugeAddress, address),
    enabled: open && Boolean(publicClient),
    queryFn: () =>
      fetchGaugeIncentiveData({
        publicClient: publicClient as PublicClient,
        chainId,
        target,
        account: address,
      }),
    staleTime: 10_000,
    refetchInterval: open ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
