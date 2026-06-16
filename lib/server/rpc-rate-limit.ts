import { createTokenBucketRateLimiter } from "@/lib/server/rate-limit";

function getRpsLimit(): number {
  const raw = process.env.SPECTRUM_RPC_RPS_LIMIT;
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return parsed;
}

const consumeRateLimit = createTokenBucketRateLimiter({
  capacity: 10,
  windowMs: 1000,
  getCapacity: getRpsLimit,
});

export function consumeRpcRateLimit(key: string, nowMs = Date.now()) {
  return consumeRateLimit(key, nowMs);
}
