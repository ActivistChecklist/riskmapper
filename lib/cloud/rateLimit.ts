import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * In-process rate limiter backed by `rate-limiter-flexible`. Memory backend
 * is sufficient for a single-instance deploy; for horizontal scale, swap in
 * `RateLimiterRedis` (same library) without changing this module's API.
 *
 * Cached on `globalThis` so Next.js dev hot-reload doesn't reset counters
 * on every code change.
 *
 * The client key is the leftmost `x-forwarded-for` IP. That is safe only
 * because `server/webRequest.ts` replaces the header with the single address
 * our own proxies reported (see `trustedClientIp`, and `TRUSTED_PROXY_HOPS`
 * for hosts with a different number of proxies). A raw header's leftmost
 * entry is whatever the client chose to send.
 */

const g = globalThis as typeof globalThis & {
  _riskmatrixWriteLimiter?: RateLimiterMemory;
  _riskmatrixWriteLimiterMax?: number;
};

function getLimiter(maxPerMinute: number): RateLimiterMemory {
  if (
    !g._riskmatrixWriteLimiter ||
    g._riskmatrixWriteLimiterMax !== maxPerMinute
  ) {
    g._riskmatrixWriteLimiter = new RateLimiterMemory({
      points: maxPerMinute,
      duration: 60, // seconds
    });
    g._riskmatrixWriteLimiterMax = maxPerMinute;
  }
  return g._riskmatrixWriteLimiter;
}

export async function rateLimit(
  req: Request,
  maxPerMinute: number,
): Promise<Response | null> {
  const key = clientKey(req);
  const limiter = getLimiter(maxPerMinute);
  try {
    await limiter.consume(key, 1);
    return null;
  } catch (rejected) {
    const retrySeconds =
      typeof rejected === "object" &&
      rejected !== null &&
      "msBeforeNext" in rejected &&
      typeof (rejected as { msBeforeNext?: unknown }).msBeforeNext === "number"
        ? Math.ceil((rejected as { msBeforeNext: number }).msBeforeNext / 1000)
        : 60;
    return new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retrySeconds),
      },
    });
  }
}

function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "anonymous";
}

export function __resetRateLimiterForTests(): void {
  g._riskmatrixWriteLimiter = undefined;
  g._riskmatrixWriteLimiterMax = undefined;
}
