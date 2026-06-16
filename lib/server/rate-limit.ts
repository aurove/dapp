type Bucket = {
  tokens: number;
  updatedAtMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type TokenBucketRateLimiterOptions = {
  capacity: number;
  windowMs: number;
  getCapacity?: () => number;
};

export type TokenBucketRateLimiter = (key: string, nowMs?: number) => RateLimitResult;

export function createTokenBucketRateLimiter(
  options: TokenBucketRateLimiterOptions,
): TokenBucketRateLimiter {
  const buckets = new Map<string, Bucket>();

  function getCapacity(): number {
    const capacity = options.getCapacity?.() ?? options.capacity;
    return Number.isFinite(capacity) && capacity > 0 ? capacity : options.capacity;
  }

  return (key: string, nowMs = Date.now()): RateLimitResult => {
    const capacity = getCapacity();
    const existing = buckets.get(key) ?? { tokens: capacity, updatedAtMs: nowMs };
    const elapsed = Math.max(0, nowMs - existing.updatedAtMs);
    const refillRate = capacity / options.windowMs;
    const tokens = Math.min(capacity, existing.tokens + elapsed * refillRate);
    const bucket: Bucket = { tokens, updatedAtMs: nowMs };

    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      const missing = 1 - bucket.tokens;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((missing * options.windowMs) / capacity / 1000)),
      };
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

