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
