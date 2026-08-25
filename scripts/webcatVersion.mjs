/**
 * The manifest version, and the rule that makes it useful.
 *
 * WEBCAT caches an origin's manifest for the life of a browser session. A
 * deploy that lands mid-session leaves the extension holding the manifest for
 * the *previous* build, so every file it then checks hashes differently and
 * the site is blocked with an integrity error until the browser is restarted.
 *
 * The extension's escape hatch is a response header. `x-webcat-version` is
 * compared against the cached manifest's `version` on every response, and a
 * strictly newer value makes it drop the cached origin, clear the caches for
 * the domain and reload the tab, picking up the new manifest. See
 * `extension/src/webcat/response.ts` upstream.
 *
 * That only helps if the version actually moves. `yarn webcat:sign` therefore
 * chooses the next version here rather than trusting anyone to remember, and
 * the last signed manifest is the record it counts from: it is committed, so
 * it survives a fresh clone, and it is by definition what clients cached.
 *
 * These helpers are pure so they can be tested without signing anything.
 */

/**
 * What the extension can actually compare.
 *
 * Its comparison is `Number()` per dot-separated part, so a prerelease suffix
 * like "1.2.0-rc1" becomes NaN and every comparison against it is false — the
 * header would be sent, ignored, and the failure would look exactly like the
 * feature working. Refusing the format up front is the only way that gets
 * noticed.
 */
export const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

export function isValidVersion(version) {
  return typeof version === "string" && VERSION_PATTERN.test(version);
}

/**
 * A deliberate copy of the extension's `isNewerSemver`, so "newer" means here
 * what it means there. Missing parts count as zero, which is why "1.2" and
 * "1.2.0" compare equal.
 */
export function isNewerSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

/** Increment the last part: 0.1.0 -> 0.1.1, and 3 -> 4. */
export function bumpPatch(version) {
  const parts = version.split(".");
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join(".");
}

/**
 * The version the manifest about to be signed should carry.
 *
 * `configured` is `webcat.config.json`'s version, which is the human's
 * intent and is pinned to package.json by webcat.config.test.ts. It wins when
 * it is already ahead, so a real release bump (0.1.7 -> 0.2.0) is respected.
 * Otherwise the published version is bumped, which covers the ordinary case of
 * signing several deploys between releases without touching either file.
 *
 * Nothing here can return a version that is not strictly newer than what was
 * published, which is the whole property the header depends on.
 */
export function nextVersion(published, configured) {
  if (!isValidVersion(configured)) {
    throw new Error(
      `webcat.config.json version ${JSON.stringify(configured)} is not dotted digits. ` +
        "The extension compares versions numerically and silently ignores anything else.",
    );
  }

  if (published === null || published === undefined) {
    return { version: configured, reason: "nothing published yet" };
  }

  if (!isValidVersion(published)) {
    return {
      version: configured,
      reason: `the published manifest's version ${JSON.stringify(published)} is not dotted digits`,
    };
  }

  if (isNewerSemver(configured, published)) {
    return { version: configured, reason: `webcat.config.json is ahead of ${published}` };
  }

  return { version: bumpPatch(published), reason: `bumped from the published ${published}` };
}
