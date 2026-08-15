import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { matchApiRoute, type RouteId } from "./apiRoutes";
import { CONTENT_SECURITY_POLICY } from "./csp";
import { cacheControlFor, resolveStaticRequest } from "./staticFiles";
import { toWebRequest } from "./webRequest";
import { POST as counterPOST } from "./routes/counter";
import { GET as healthzGET } from "./routes/healthz";
import { POST as matrixCreate } from "./routes/matrix";
import { PUT as matrixBaselinePUT } from "./routes/matrixBaseline";
import { DELETE as matrixDELETE, GET as matrixGET } from "./routes/matrixById";
import { GET as matrixEventsGET } from "./routes/matrixEvents";
import { POST as matrixUpdatesPOST } from "./routes/matrixUpdates";

/**
 * The single production process: serves the static client build and the API
 * from one origin.
 *
 * One origin is deliberate. It keeps client requests same-origin so no CORS
 * allow-list is reintroduced, and it means `connect-src 'self'` will be
 * enough once WEBCAT is enforcing. See MIGRATION.md decision D5.
 *
 * The route handlers below are the same functions Next called, unchanged and
 * still speaking Web `Request`/`Response`, which is why `lib/cloud/handlers.test.ts`
 * kept its assertions across the move.
 */

const DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const PORT = Number(process.env.PORT ?? 3002);
const HOST = process.env.HOST ?? "0.0.0.0";

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response> | Response;

const HANDLERS: Record<RouteId, Handler> = {
  healthz: healthzGET as Handler,
  counter: counterPOST as Handler,
  matrixCreate: matrixCreate as Handler,
  matrixRead: matrixGET as Handler,
  matrixDelete: matrixDELETE as Handler,
  matrixUpdates: matrixUpdatesPOST as Handler,
  matrixBaseline: matrixBaselinePUT as Handler,
  matrixEvents: matrixEventsGET as Handler,
};

/** Web Response → ServerResponse, streaming the body so SSE stays live. */
async function sendWebResponse(
  res: ServerResponse,
  webRes: Response,
): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  webRes.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webRes.status, headers);

  if (!webRes.body) {
    res.end();
    return;
  }

  // Pipe rather than buffer: the events endpoint returns an open stream that
  // never completes, and buffering it would hang the response forever.
  const nodeStream = Readable.fromWeb(webRes.body as never);
  nodeStream.pipe(res);
  res.on("close", () => nodeStream.destroy());
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function existsInDist(relPath: string): boolean {
  const abs = safeJoin(relPath);
  if (!abs) return false;
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Second, independent traversal guard. `resolveStaticRequest` already refuses
 * ".." segments; this re-derives the absolute path and refuses anything that
 * escapes the build root, so a bug in one check does not open the filesystem.
 */
function safeJoin(relPath: string): string | null {
  const abs = path.resolve(DIST, "." + relPath);
  if (abs !== DIST && !abs.startsWith(DIST + path.sep)) return null;
  return abs;
}

function serveFile(res: ServerResponse, relPath: string, status = 200): void {
  const abs = safeJoin(relPath);
  if (!abs || !existsSync(abs)) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(status, {
    "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": cacheControlFor(relPath),
    // Must stay identical to `default_csp` in the WEBCAT manifest: once the
    // domain is enrolled the extension enforces the signed policy, so a
    // divergence means extension users get different behaviour from everyone
    // else. Both read from server/csp.ts for that reason.
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    // Cheap hardening that costs nothing here and is independent of WEBCAT.
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  createReadStream(abs).pipe(res);
}

const server = createServer((req, res) => {
  void handle(req, res).catch((err) => {
    console.error("[server] unhandled error:", err instanceof Error ? err.message : err);
    if (!res.headersSent) sendJson(res, 500, { error: "internal" });
    else res.end();
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Split before any percent-decoding so a query string cannot smuggle path
  // segments into static resolution.
  const rawPath = (req.url ?? "/").split("?")[0].split("#")[0];
  const method = (req.method ?? "GET").toUpperCase();

  const api = matchApiRoute(method, rawPath);

  if (api.kind === "notFound") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (api.kind === "methodNotAllowed") {
    res.writeHead(405, { Allow: api.allow.join(", "), "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }
  if (api.kind === "match") {
    const webReq = toWebRequest(req, res, `localhost:${PORT}`);
    const handler = HANDLERS[api.route];
    const id = api.id ?? "";
    await sendWebResponse(res, await handler(webReq, { params: Promise.resolve({ id }) }));
    return;
  }

  // Static. Only GET and HEAD; anything else is a client bug, not a route.
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  const resolved = resolveStaticRequest(rawPath, existsInDist);
  switch (resolved.kind) {
    case "deny":
      sendJson(res, 400, { error: "bad request" });
      return;
    case "notFound":
      // A well-known resource that isn't published. Answer honestly rather
      // than handing a WEBCAT client the SPA document.
      sendJson(res, 404, { error: "not found" });
      return;
    case "redirect":
      res.writeHead(301, { Location: resolved.location });
      res.end();
      return;
    case "file":
      serveFile(res, resolved.path);
      return;
    case "fallback":
      // 200, not 404: the SPA renders its own not-found view, and WEBCAT
      // needs one manifested fallback document. See MIGRATION.md D3.
      serveFile(res, resolved.path);
      return;
  }
}

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT} (serving ${DIST})`);
});
