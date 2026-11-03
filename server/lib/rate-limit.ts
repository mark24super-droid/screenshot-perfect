type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

/** Small in-memory fixed-window limiter. Suitable for a single process. */
export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function clientKey(req: { ip?: string }, suffix: string): string {
  return `${req.ip || "unknown"}:${suffix}`;
}

// Periodically drop expired buckets so the map does not grow forever.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
}, 60_000);
cleanup.unref?.();
