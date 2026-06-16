import { createTokenBucketRateLimiter } from "@/lib/server/rate-limit";

const consumeRateLimit = createTokenBucketRateLimiter({
  capacity: 4,
  windowMs: 10 * 60 * 1000,
});

export function consumeAuthNonceRateLimit(key: string, nowMs = Date.now()) {
  return consumeRateLimit(key, nowMs);
}
