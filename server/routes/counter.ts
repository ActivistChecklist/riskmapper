import { createRouteHandler } from "@activistchecklist/umami-extra-privacy/next";

/**
 * POST /api/counter, the server-side relay for Umami analytics events.
 *
 * The browser never talks to Umami directly. The relay replaces the client IP
 * with a `geo-hash` stand-in and forwards the event to the configured Umami
 * instance. The stand-in keeps the first 19 bits of an IPv4 address (28 of
 * IPv6), enough for a rough location, and shuffles the rest with a random key
 * that exists only in this process's memory and is wiped at each UTC
 * midnight. Within a day one address always gets the same stand-in, so Umami
 * sessions still work; once the key is gone nobody, us included, can tell
 * which stand-in a real address was given. A restart also starts a new key.
 *
 * The client IP comes from `x-forwarded-for`, which `toWebRequest` in
 * `server/webRequest.ts` has already cut down to the one address our proxies
 * vouch for. Umami credentials come from env vars (see `.env.local.example`).
 * What we tell readers about this is the "How we anonymize your IP" section of
 * `client/PrivacyPage.tsx`; keep the two in step.
 */
const handler = createRouteHandler({ level: "geo-hash" });

// Wrapped so the route has the same `(Request) => Promise<Response>` shape as
// the others in `server/index.ts`, rather than the package's structural type.
export async function POST(req: Request): Promise<Response> {
  return handler(req);
}
