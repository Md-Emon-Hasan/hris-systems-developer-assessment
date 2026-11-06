const buckets = new Map<string, { count: number; resetAt: number }>();

/** Process-local guardrail; production multi-instance deployments should use a shared limiter. */
export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  bucket.count++;
  if (buckets.size > 5000) for (const [entry, value] of buckets) if (value.resetAt <= now) buckets.delete(entry);
  return { allowed: true, retryAfterSeconds: 0 };
}
