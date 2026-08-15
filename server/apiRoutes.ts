/**
 * API route matching.
 *
 * Replaces the filesystem routing Next used to provide. Pure so the table
 * can be tested without a live server: it maps (method, pathname) to a route
 * id plus the extracted `:id`, and `server/index.ts` owns the id → handler
 * map.
 *
 * Anything under /api that does not match is a 404 from *this* table, never
 * the SPA fallback. A client expecting JSON must not silently receive an
 * HTML document.
 */

export const API_PREFIX = "/api/";

export type RouteId =
  | "healthz"
  | "counter"
  | "matrixCreate"
  | "matrixRead"
  | "matrixDelete"
  | "matrixUpdates"
  | "matrixBaseline"
  | "matrixEvents";

export type ApiMatch =
  | { kind: "match"; route: RouteId; id?: string }
  /** Under /api but no route: answer 404 JSON, do not fall through. */
  | { kind: "notFound" }
  /** Path matches a known route but with the wrong verb. */
  | { kind: "methodNotAllowed"; allow: string[] }
  /** Not an API path at all: hand off to static resolution. */
  | { kind: "notApi" };

/**
 * The id is minted client-side and validated again inside each handler via
 * `isPlausibleId`. This pattern is deliberately the same shape, so a
 * malformed id 404s at the router instead of reaching Mongo.
 */
const ID = "([A-Za-z0-9_-]{16,64})";

type Rule = {
  pattern: RegExp;
  methods: Partial<Record<string, RouteId>>;
};

const RULES: Rule[] = [
  { pattern: /^\/api\/healthz$/, methods: { GET: "healthz" } },
  { pattern: /^\/api\/counter$/, methods: { POST: "counter" } },
  { pattern: /^\/api\/matrix$/, methods: { POST: "matrixCreate" } },
  {
    pattern: new RegExp(`^/api/matrix/${ID}$`),
    methods: { GET: "matrixRead", DELETE: "matrixDelete" },
  },
  {
    pattern: new RegExp(`^/api/matrix/${ID}/updates$`),
    methods: { POST: "matrixUpdates" },
  },
  {
    pattern: new RegExp(`^/api/matrix/${ID}/baseline$`),
    methods: { PUT: "matrixBaseline" },
  },
  {
    pattern: new RegExp(`^/api/matrix/${ID}/events$`),
    methods: { GET: "matrixEvents" },
  },
];

export function matchApiRoute(method: string, pathname: string): ApiMatch {
  if (pathname !== "/api" && !pathname.startsWith(API_PREFIX)) {
    return { kind: "notApi" };
  }

  for (const rule of RULES) {
    const m = rule.pattern.exec(pathname);
    if (!m) continue;
    const route = rule.methods[method];
    if (!route) {
      return { kind: "methodNotAllowed", allow: Object.keys(rule.methods) };
    }
    return m[1] ? { kind: "match", route, id: m[1] } : { kind: "match", route };
  }

  return { kind: "notFound" };
}
