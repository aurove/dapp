type Bucket = {
  tokens: number;
  updatedAtMs: number;
};

const buckets = new Map<string, Bucket>();

function getRpsLimit(): number {
  const raw = process.env.SPECTRUM_RPC_RPS_LIMIT;
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return parsed;
}

function refillBucket(bucket: Bucket, rate: number, nowMs: number): Bucket {
  const elapsedSeconds = Math.max(0, (nowMs - bucket.updatedAtMs) / 1000);
  const capacity = rate;
  const refilled = Math.min(capacity, bucket.tokens + elapsedSeconds * rate);
  return {
    tokens: refilled,
    updatedAtMs: nowMs,
  };
}

export function consumeRpcRateLimit(
  key: string,
  nowMs = Date.now(),
): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const rate = getRpsLimit();
  const existing = buckets.get(key) ?? { tokens: rate, updatedAtMs: nowMs };
  const bucket = refillBucket(existing, rate, nowMs);

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const missing = 1 - bucket.tokens;
    const retryAfterSeconds = Math.max(1, Math.ceil(missing / rate));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}
