export const READ_GC_TIME_MS = 10 * 60_000;
export const METADATA_READ_GC_TIME_MS = 24 * 60 * 60_000;

export const SHORT_STALE_MS = 30_000;
export const MEDIUM_STALE_MS = 60_000;
export const LONG_STALE_MS = 120_000;
export const METADATA_STALE_MS = 24 * 60 * 60_000;

type ReadQueryOptionsConfig = {
  staleTime: number;
  gcTime?: number;
};

export function buildReadQueryOptions(config: ReadQueryOptionsConfig) {
  return {
    staleTime: config.staleTime,
    gcTime: config.gcTime ?? READ_GC_TIME_MS,
    refetchInterval: false as const,
    refetchIntervalInBackground: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
    retry: 1,
  };
}

export const coreReadQueryOptions = buildReadQueryOptions({
  staleTime: SHORT_STALE_MS,
});

export const detailReadQueryOptions = buildReadQueryOptions({
  staleTime: MEDIUM_STALE_MS,
});

export const heavyReadQueryOptions = buildReadQueryOptions({
  staleTime: LONG_STALE_MS,
});

export const staticReadQueryOptions = buildReadQueryOptions({
  staleTime: LONG_STALE_MS,
});

export const metadataReadQueryOptions = buildReadQueryOptions({
  staleTime: METADATA_STALE_MS,
  gcTime: METADATA_READ_GC_TIME_MS,
});
