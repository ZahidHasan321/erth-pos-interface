import type { Context } from "hono";

/** Client IP as seen by Caddy (the api is only reachable through it). */
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "unknown";
}

/** Fixed-window per-key limiter, in memory (single api instance). */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  /** Returns seconds to wait when over the limit, else 0. */
  return (key: string): number => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return 0;
    }
    h.count++;
    return h.count > limit ? Math.ceil((h.reset - now) / 1000) : 0;
  };
}
