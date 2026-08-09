export const DEFAULT_TRANSACTION_DEADLINE_WINDOW_SECONDS = 30n * 60n;

export function deriveChainDeadline(
  chainTimestamp: bigint | null | undefined,
  windowSeconds = DEFAULT_TRANSACTION_DEADLINE_WINDOW_SECONDS,
): bigint | null {
  if (chainTimestamp === null || chainTimestamp === undefined) return null;
  if (windowSeconds <= 0n) return chainTimestamp;
  return chainTimestamp + windowSeconds;
}

/** Matches on-chain guards that accept `block.timestamp <= deadline`. */
export function hasChainTimestampPassed(
  chainTimestamp: bigint | null | undefined,
  targetTimestamp: bigint | null | undefined,
): boolean {
  return (
    chainTimestamp !== null &&
    chainTimestamp !== undefined &&
    targetTimestamp !== null &&
    targetTimestamp !== undefined &&
    chainTimestamp > targetTimestamp
  );
}
