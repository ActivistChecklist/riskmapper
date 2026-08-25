import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Tells a WEBCAT client, on every response, which manifest this build serves.
 *
 * The extension fetches an origin's manifest once and caches it for the
 * session. A deploy that lands while someone has the app open therefore leaves
 * them holding the previous build's manifest, and every file it checks from
 * then on hashes differently: the site is blocked with an integrity error
 * until the browser is restarted. For a tool people open when they are already
 * under pressure, "quit Firefox and try again" is not a failure mode we can
 * ship.
 *
 * `x-webcat-version` is the extension's answer. It compares the header against
 * the cached manifest's `version`, and a strictly newer value makes it drop
 * the cached origin, clear the caches for the domain and reload the tab, which
 * picks up the manifest that matches the bytes now being served. The mechanism
 * is undocumented upstream; the implementation is `validateHeaders` in
 * `extension/src/webcat/response.ts`.
 *
 * The value comes from the served manifest rather than from
 * `webcat.config.json`, because the only honest answer to "which manifest
 * describes these bytes" is the one shipping beside them. A build with no
 * signed manifest — a fresh clone, local dev — sends no header at all, which
 * is the truthful answer rather than a version nothing was signed under.
 *
 * `scripts/webcat-sign.mjs` is the other half: the header does nothing unless
 * the version actually moves between signatures, and that is where it is made
 * to. See `scripts/webcatVersion.mjs`.
 */

export const WEBCAT_VERSION_HEADER = "X-Webcat-Version";

/**
 * The extension parses each dot-separated part with `Number()`, so anything
 * else compares as NaN and is silently ignored. A header that is quietly
 * inert is worse than no header, because it looks like the feature works — so
 * refuse to send one and say why.
 */
const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

/**
 * The version of the signed manifest in `distDir`, or null when there is
 * nothing usable to send. Reads from disk, so callers should do it once at
 * boot: the file cannot change under a running process.
 */
export function readSignedManifestVersion(
  distDir: string,
  log = console,
): string | null {
  const manifestPath = path.join(distDir, ".well-known/webcat/manifest.json");
  if (!existsSync(manifestPath)) return null;

  let version: unknown;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    version = (parsed.manifest ?? parsed).version;
  } catch (err) {
    // Not fatal here: verifyManifest.ts already reports an unreadable
    // manifest as a mismatch, and that is the check that fails the deploy.
    log.error(`[webcat] cannot read the manifest version: ${(err as Error).message}`);
    return null;
  }

  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    log.error(
      `[webcat] manifest version ${JSON.stringify(version)} is not dotted digits, ` +
        `so no ${WEBCAT_VERSION_HEADER} header will be sent. Clients that cached an ` +
        "older manifest will be blocked until they restart the browser.",
    );
    return null;
  }

  return version;
}
