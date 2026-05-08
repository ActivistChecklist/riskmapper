import { createRouteHandler } from "@activistchecklist/umami-extra-privacy/next";

/**
 * POST /api/counter — server-side relay for Umami analytics events.
 *
 * The browser never talks to Umami directly. The relay anonymizes the
 * client IP via `geo-hash` (preserves coarse country/region info but
 * randomizes per-visitor bits using a daily-rotating salted hash) and
 * forwards the event to the configured Umami instance. See
 * THREAT-MODEL.md for the privacy reasoning.
 *
 * Credentials and salt are loaded from env vars (see `.env.local.example`).
 */

export const runtime = "nodejs";

// The package's adapter is typed against a structural `NextLikeRequest`
// shape; Next.js 16 validates Route Handler exports nominally and only
// accepts `Request | NextRequest`. Wrap the adapter so the exported
// function has the exact shape Next expects.
const handler = createRouteHandler({ level: "geo-hash" });

export async function POST(req: Request): Promise<Response> {
  return handler(req);
}
