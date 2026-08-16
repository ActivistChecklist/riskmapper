import {
  describe as describeResult,
  isUnhealthy,
  verifyManifestAgainstDist,
  verifyModeFromEnv,
  type VerifyResult,
} from "./verifyManifest";

/**
 * Holds the boot-time manifest check so `/api/healthz` can answer instantly.
 *
 * Computed once at startup rather than per request: the files cannot change
 * under a running process, and hashing a few megabytes on every healthcheck
 * poll would be wasteful. `server/index.ts` calls `runManifestCheck` before it
 * starts listening.
 */

let cached: { healthy: boolean; summary: string; problems: string[] } = {
  healthy: true,
  summary: "not checked yet",
  problems: [],
};

export function runManifestCheck(distDir: string, log = console): VerifyResult {
  const mode = verifyModeFromEnv();
  if (mode === "off") {
    cached = { healthy: true, summary: "checking disabled (WEBCAT_VERIFY=off)", problems: [] };
    return { status: "skipped", reason: "disabled" };
  }

  const result = verifyManifestAgainstDist(distDir);
  const summary = describeResult(result);
  const problems = result.status === "mismatch" ? result.problems : [];
  cached = { healthy: !isUnhealthy(result, mode), summary, problems };

  if (result.status === "mismatch") {
    // Loud on purpose: in warn mode this line is the only warning anyone gets.
    log.error(`[webcat] MANIFEST MISMATCH: ${summary}`);
    for (const p of problems.slice(0, 10)) log.error(`[webcat]   ${p}`);
    if (problems.length > 10) log.error(`[webcat]   …and ${problems.length - 10} more`);
    log.error(
      mode === "enforce"
        ? "[webcat] Failing the healthcheck so this build is not promoted. " +
            "Re-run `yarn webcat:sign` against this build and redeploy."
        : "[webcat] WEBCAT_VERIFY is not 'enforce', so this build will still serve. " +
            "Once the domain is enrolled, this state blocks the site for extension users.",
    );
  } else {
    log.log(`[webcat] ${summary}`);
  }
  return result;
}

export function getManifestHealth() {
  return cached;
}
