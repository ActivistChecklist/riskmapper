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

export const SPA_FALLBACK = "/index.html";
export const DIRECTORY_INDEX = "index.html";

export type StaticResolution =
  /** Serve this exact path from the build root. */
  | { kind: "file"; path: string }
  /** Send a 301 to the canonical trailing-slash form. */
  | { kind: "redirect"; location: string }
  /** Serve the SPA document with a 200; the client renders the route. */
  | { kind: "fallback"; path: typeof SPA_FALLBACK }
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

  if (decoded.endsWith("/")) {
    const index = decoded + DIRECTORY_INDEX;
    return exists(index)
      ? { kind: "file", path: index }
      : { kind: "fallback", path: SPA_FALLBACK };
  }

  if (exists(decoded)) {
    return { kind: "file", path: decoded };
  }

  if (exists(`${decoded}/${DIRECTORY_INDEX}`)) {
    return { kind: "redirect", location: `${decoded}/` };
  }

  return { kind: "fallback", path: SPA_FALLBACK };
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
