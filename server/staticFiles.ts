/**
 * Static-file request resolution for the production server.
 *
 * Pure and filesystem-agnostic on purpose: the `exists` predicate is
 * injected so path-traversal behaviour is directly testable without laying
 * down fixture files. `server/index.ts` supplies the real predicate and
 * re-checks containment against the build root before opening anything, so
 * traversal has to get past two independent guards.
 *
 * Resolution order, which deliberately mirrors how the WEBCAT extension
 * resolves a path against a manifest (exact match, then `default_index` for
 * directory paths, then `default_fallback`):
 *
 *   1. Reject anything malformed or traversing.
 *   2. Path ends in "/"        → that directory's index.html, if it exists.
 *   3. Exact file exists       → serve it.
 *   4. Directory index exists  → redirect to the trailing-slash form.
 *   5. Otherwise               → fall back to the SPA at /index.html.
 *
 * Step 4 is why it is a redirect and not a silent serve. Handing back
 * privacy/index.html's bytes at the path "/privacy" would break WEBCAT: the
 * extension finds no exact match, applies `default_index` only to paths
 * ending in "/", and so falls through to `default_fallback` (index.html),
 * whose hash will not match what was served. See MIGRATION.md D7.
 */

import { posix } from "node:path";
import { OFFLINE_DOWNLOAD_DIR } from "@/lib/offlinePaths.mts";

export const SPA_FALLBACK = "/index.html";
export const DIRECTORY_INDEX = "index.html";

/**
 * RFC 8615 machine-readable namespace. WEBCAT publishes its enrollment,
 * manifest and bundle under `/.well-known/webcat/`, and clients fetching one
 * of those need an honest 404 when it is absent. Handing back the SPA's HTML
 * with a 200 would make a missing manifest look like a malformed one.
 */
export const WELL_KNOWN_PREFIX = "/.well-known/";

export type StaticResolution =
  /** Serve this exact path from the build root. */
  | { kind: "file"; path: string }
  /** Send a 301 to the canonical trailing-slash form. */
  | { kind: "redirect"; location: string }
  /** Serve the SPA document with a 200; the client renders the route. */
  | { kind: "fallback"; path: typeof SPA_FALLBACK }
  /** Absent, and in a namespace where the SPA is the wrong answer. */
  | { kind: "notFound" }
  /** Malformed or traversing: refuse without touching the filesystem. */
  | { kind: "deny"; reason: string };

/**
 * Percent-decode a URL path, refusing anything that cannot be decoded.
 * A malformed escape is a signal of probing, not of a real request.
 */
function decodePath(rawPath: string): string | null {
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

function isTraversal(decodedPath: string): boolean {
  // Compare segment-wise rather than substring-wise so legitimate names
  // containing dots (e.g. "main-Df4apONn.js", "..foo") are not rejected.
  return decodedPath.split("/").some((segment) => segment === "..");
}

export function resolveStaticRequest(
  rawPath: string,
  exists: (path: string) => boolean,
): StaticResolution {
  if (!rawPath.startsWith("/")) {
    return { kind: "deny", reason: "path must be absolute" };
  }

  const decoded = decodePath(rawPath);
  if (decoded === null) {
    return { kind: "deny", reason: "malformed percent-encoding" };
  }
  // A NUL byte can truncate a path inside a native filesystem call.
  if (decoded.includes("\0")) {
    return { kind: "deny", reason: "path contains NUL" };
  }
  // Backslash is a legal filename character on POSIX but is a separator on
  // Windows; refusing it keeps behaviour identical across hosts.
  if (decoded.includes("\\")) {
    return { kind: "deny", reason: "path contains backslash" };
  }
  if (isTraversal(decoded)) {
    return { kind: "deny", reason: "path traversal" };
  }

  // Resolved before the fallback so an absent well-known resource 404s
  // instead of quietly returning the SPA document.
  const missing = (): StaticResolution =>
    decoded.startsWith(WELL_KNOWN_PREFIX)
      ? { kind: "notFound" }
      : { kind: "fallback", path: SPA_FALLBACK };

  if (decoded.endsWith("/")) {
    const index = decoded + DIRECTORY_INDEX;
    return exists(index) ? { kind: "file", path: index } : missing();
  }

  if (exists(decoded)) {
    return { kind: "file", path: decoded };
  }

  if (exists(`${decoded}/${DIRECTORY_INDEX}`)) {
    return { kind: "redirect", location: `${decoded}/` };
  }

  return missing();
}

/**
 * Cache policy. Hashed assets are immutable and can be cached hard; HTML
 * must not be, or a client can pin a stale document against a fresh
 * manifest once WEBCAT is enforcing.
 */
export function cacheControlFor(path: string): string {
  if (path.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (path.endsWith(".html")) return "no-cache";
  return "public, max-age=3600";
}

/** Files under here are for saving to disk, never for viewing on the site. */
export const DOWNLOAD_PREFIX = `/${OFFLINE_DOWNLOAD_DIR}/`;

/**
 * `Content-Disposition` for a static file, or null for one the browser
 * should display as usual.
 *
 * The offline build (dist/download/riskmapper-offline.html) is an HTML file
 * made of inline scripts. Rendered on this origin, our CSP would block every
 * one of them and leave a blank page, so it is always sent as an attachment:
 * the browser saves it and the person opens it from disk, where the file's
 * own CSP applies. See scripts/offlineHtml.mts. Its checksum file sits
 * beside it and displays as plain text.
 *
 * The path is normalized first because the server serves `//download/...`
 * and `/./download/...` from the same file (`safeJoin` resolves them), and
 * the header must follow the file, not the spelling of the request.
 */
export function contentDispositionFor(requestPath: string): string | null {
  const normalized = posix.normalize(requestPath);
  if (!normalized.startsWith(DOWNLOAD_PREFIX) || !normalized.endsWith(".html")) return null;
  const name = normalized.slice(normalized.lastIndexOf("/") + 1);
  // Built file names only, but keep the header well-formed regardless.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return "attachment";
  return `attachment; filename="${name}"`;
}
