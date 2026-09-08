// Fixed-window in-process rate limiter. Single-instance appropriate for V1;
// swap for Redis/Upstash at multi-instance scale.
import "server-only";

type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __iptBuckets?: Map<string, Bucket> };
function buckets(): Map<string, Bucket> {
  if (!g.__iptBuckets) g.__iptBuckets = new Map();
  return g.__iptBuckets;
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets().get(key);
  if (!b || b.resetAt <= now) {
    buckets().set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
