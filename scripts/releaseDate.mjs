import { writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The date shown as "built on" in the offline copy and on the Security page,
 * so someone holding an old copy can tell it is out of date.
 *
 * It lives in a committed file, release.json, instead of being read from the
 * clock during the build, because the build must come out byte-for-byte the
 * same wherever it runs: `yarn webcat:sign` hashes a local build and the
 * deploy makes its own. Signing writes today's date here just before it
 * builds, and the pre-push hook commits the file with the signature, so the
 * deploy builds with the same date. Ordinary builds read it unchanged.
 */
export const RELEASE_FILE = "release.json";

/** Today's date in UTC as YYYY-MM-DD. */
export function releaseDateFor(now) {
  return now.toISOString().slice(0, 10);
}

/** Write today's date into release.json and return it. */
export function stampReleaseDate(root, now = new Date()) {
  const builtOn = releaseDateFor(now);
  writeFileSync(path.join(root, RELEASE_FILE), `${JSON.stringify({ builtOn }, null, 2)}\n`);
  return builtOn;
}
