/** Protocol stats revalidate every 5–15 minutes (default 10m). */
export const PROTOCOL_STATS_REVALIDATE_SECONDS = 600;
export const PROTOCOL_STATS_STALE_MS = 5 * 60_000;
export const PROTOCOL_STATS_GC_MS = 30 * 60_000;
export const PROTOCOL_STATS_REFETCH_MS = 10 * 60_000;

/** Cap log scan chunks so stats never hang the API. */
export const STATS_LOG_CHUNK_BLOCKS = 8_000n;
export const STATS_LOG_MAX_CHUNKS = 48;
