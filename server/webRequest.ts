import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

/**
 * Node `IncomingMessage` → Web `Request`, so the route handlers keep running
 * unchanged against the same interface Next gave them.
 *
 * The signal wiring is the part that matters. `server/routes/matrixEvents.ts`
 * hangs its cleanup off `req.signal`'s abort event, which is how it
 * unsubscribes from the pub/sub fan-out and clears its 25s heartbeat when a
 * client disconnects. A `Request` built without a signal never aborts, so
 * every dropped SSE connection would leak a subscription and a live interval
 * for the lifetime of the process. Handing over a real signal keeps that
 * contract intact outside Next.
 */

export type AbortWiring = {
  signal: AbortSignal;
  /** Exposed for tests; production callers just pass the signal along. */
  abort: () => void;
};

/**
 * Abort when the client goes away.
 *
 * `res` "close" is the dependable trigger: it fires both on a completed
 * exchange and on a premature disconnect, and for a long-lived SSE response
 * the disconnect is the only thing that ends it. Aborting after a normal
 * completion is harmless, since the handler has already finished by then.
 */
export function abortWiringFor(
  req: Pick<IncomingMessage, "on">,
  res: Pick<ServerResponse, "on">,
): AbortWiring {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  res.on("close", abort);
  req.on("aborted", abort);
  req.on("error", abort);
  return { signal: controller.signal, abort };
}

function headerValue(
  req: IncomingMessage,
  name: string,
): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * How many entries at the right end of `X-Forwarded-For` were written by
 * proxies we run behind. `TRUSTED_PROXY_HOPS`, default 1.
 */
export function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Whether the socket peer could be a proxy we run behind: a loopback or
 * private address. A peer on the public internet reached the app directly,
 * so any `X-Forwarded-For` it sends is its own invention.
 *
 * On a shared host such as May First, every member's processes also connect
 * from loopback, so this cannot tell our Apache from a neighbour. There the
 * boundary is that the app listens on 127.0.0.1 only.
 */
export function isProxyPeer(peer: string | undefined): boolean {
  if (!peer) return false;
  const addr = peer.startsWith("::ffff:") ? peer.slice("::ffff:".length) : peer;
  if (addr === "::1" || /^f[cd][0-9a-f]{2}:/i.test(addr)) return true;
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * The visitor's address, as reported by the proxies we trust.
 *
 * Every proxy appends the address it received the request from, so only the
 * rightmost `hops` entries of `X-Forwarded-For` come from our own
 * infrastructure. Anything to their left was sent by the client and can say
 * anything, which is why the leftmost entry must never be trusted: a client
 * that sends `X-Forwarded-For: 1.2.3.4` would otherwise choose its own
 * rate-limit bucket. On May First the header arrives as
 * `<client-supplied...>, <visitor>, <visitor>` (nginx, then Apache, each
 * appending the visitor's address), so the default of one hop picks the
 * rightmost entry.
 *
 * The socket's peer address is used instead when there is no header (local
 * dev), when the peer is not a proxy (`isProxyPeer`), or when the chain has
 * fewer entries than our proxies write, which means the request did not pass
 * through all of them and every entry may be the client's.
 */
export function trustedClientIp(
  forwardedFor: string | undefined,
  peer: string | undefined,
  hops = trustedProxyHops(),
): string | undefined {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!isProxyPeer(peer) || entries.length < hops) return peer || undefined;
  return entries[entries.length - hops];
}

export function toWebRequest(
  req: IncomingMessage,
  res: ServerResponse,
  fallbackHost: string,
): Request {
  const proto = headerValue(req, "x-forwarded-proto") ?? "http";
  const host = headerValue(req, "host") ?? fallbackHost;
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  // Hand the routes one trustworthy address and nothing a client could have
  // written: the rate limiter and the analytics relay both read the leftmost
  // `x-forwarded-for` entry, and fall back to `x-real-ip`.
  const clientIp = trustedClientIp(
    headers.get("x-forwarded-for") ?? undefined,
    req.socket?.remoteAddress,
  );
  headers.delete("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  else headers.delete("x-forwarded-for");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const { signal } = abortWiringFor(req, res);

  return new Request(url, {
    method: req.method,
    headers,
    signal,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by undici whenever a stream body is present.
    duplex: hasBody ? "half" : undefined,
  } as RequestInit & { duplex?: string });
}
