"use client";

import { useMemo } from "react";
import { erc20Abi, type Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { metadataReadQueryOptions } from "./read-query-options";

export type Erc20Metadata = {
  symbol: string | null;
  name: string | null;
  decimals: number;
};

type Erc20MetadataMap = Record<string, Erc20Metadata>;

type UseErc20MetadataMapParams = {
  chainId: number;
  addresses: Address[];
  enabled?: boolean;
};

const ERC20_METADATA_QUERY_PREFIX = "erc20-metadata";

function normalizeAddresses(addresses: Address[]) {
  return [...new Set(addresses.map((address) => address.toLowerCase()))].sort();
}

async function readMetadata(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  address: string,
): Promise<Erc20Metadata> {
  const [symbolResult, nameResult, decimalsResult] = await Promise.all([
    publicClient
      .readContract({
        address: address as Address,
        abi: erc20Abi,
        functionName: "symbol",
      })
      .catch(() => null),
    publicClient
      .readContract({
        address: address as Address,
        abi: erc20Abi,
        functionName: "name",
      })
      .catch(() => null),
    publicClient
      .readContract({
        address: address as Address,
        abi: erc20Abi,
        functionName: "decimals",
      })
      .catch(() => null),
  ]);

  return {
    symbol: typeof symbolResult === "string" && symbolResult.trim().length > 0 ? symbolResult.trim() : null,
    name: typeof nameResult === "string" && nameResult.trim().length > 0 ? nameResult.trim() : null,
    decimals:
      typeof decimalsResult === "bigint"
        ? Number(decimalsResult)
        : typeof decimalsResult === "number"
          ? decimalsResult
          : 18,
  };
}

export function useErc20MetadataMap({ chainId, addresses, enabled = true }: UseErc20MetadataMapParams) {
  const publicClient = usePublicClient();

  const normalizedAddresses = useMemo(() => normalizeAddresses(addresses), [addresses]);
  const queryKey = useMemo(
    () => [ERC20_METADATA_QUERY_PREFIX, chainId, normalizedAddresses] as const,
    [chainId, normalizedAddresses],
  );

  const metadataQuery = useQuery({
    enabled: enabled && Boolean(publicClient) && normalizedAddresses.length > 0,
    queryKey,
    queryFn: async () => {
      if (!publicClient || normalizedAddresses.length === 0) {
        return {} satisfies Erc20MetadataMap;
      }

      return Promise.all(
        normalizedAddresses.map(async (address) => [address, await readMetadata(publicClient, address)] as const),
      ).then((entries) => {
        return entries.reduce<Erc20MetadataMap>((result, [address, meta]) => {
          result[address] = meta;
          return result;
        }, {});
      });
    },
    ...metadataReadQueryOptions,
  });

  return {
    metadataByAddress: metadataQuery.data ?? {},
    isLoading: metadataQuery.isLoading,
    isFetching: metadataQuery.isFetching,
    error: (metadataQuery.error as Error | null) ?? null,
    refresh: () => metadataQuery.refetch(),
  };
}
