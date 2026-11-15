import type { SwapRoutingConfig } from "../domain";

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export function getSwapRoutingConfig(): SwapRoutingConfig {
  return {
    maxHops: boundedInteger(process.env.NEXT_PUBLIC_SWAP_MAX_HOPS, 3, 1, 5),
    maxCandidateRoutes: boundedInteger(process.env.NEXT_PUBLIC_SWAP_MAX_CANDIDATE_ROUTES, 8, 1, 64),
    quoteTtlSeconds: BigInt(
      boundedInteger(process.env.NEXT_PUBLIC_SWAP_QUOTE_TTL_SECONDS, 30, 5, 300),
    ),
    quoteTimeoutMs: boundedInteger(
      process.env.NEXT_PUBLIC_SWAP_QUOTE_TIMEOUT_MS,
      15_000,
      3_000,
      60_000,
    ),
  };
}
