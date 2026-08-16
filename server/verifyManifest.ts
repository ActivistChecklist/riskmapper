import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Checks the files this server is about to serve against the signed WEBCAT
 * manifest shipped alongside them.
 *
 * The manifest is committed to git and signed on a YubiKey; the assets are
 * whatever the deploy's build produced. Comparing the two catches the failure
 * that matters: a rebuild that produced different bytes than the ones that
 * were signed. Once the domain is enrolled that mismatch means the extension
 * blocks the site, and it is invisible to everyone else — so the server checks
 * itself at boot rather than waiting for a user to discover it.
 *
 * Wired into `/api/healthz`, which Railway uses to decide whether to promote a
 * deploy. A mismatch fails the healthcheck, Railway keeps the previous good
 * deployment, and the drifting build never serves traffic. That is nearly the
 * guarantee of deploying a prebuilt artifact, without changing the deploy
 * pipeline. See MIGRATION.md.
 *
 * The practical consequence: deploying a code change without re-signing will
 * fail the deploy. That is the intended forcing function — the alternative is
 * shipping bytes nobody signed.
 */

export type VerifyMode = "off" | "warn" | "enforce";

export type VerifyResult =
  | { status: "skipped"; reason: string }
  | { status: "ok"; fileCount: number }
  | { status: "mismatch"; problems: string[]; checked: number };

/**
 * Defaults to `enforce`: a build that does not match the signed manifest
 * should not serve traffic, and requiring an env var to get that would mean
 * one forgotten setting silently removes the protection.
 *
 * `warn` (serve anyway, log loudly) and `off` are escape hatches. Note that a
 * build with no signed manifest at all is "skipped", not a failure, so a fresh
 * clone or a pre-signing state is never blocked by this.
 */
export function verifyModeFromEnv(env = process.env): VerifyMode {
  const raw = (env.WEBCAT_VERIFY ?? "enforce").toLowerCase();
  return raw === "off" || raw === "enforce" || raw === "warn" ? raw : "enforce";
}

/** base64url SHA-256, the encoding the manifest uses. */
function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

export function verifyManifestAgainstDist(distDir: string): VerifyResult {
  const manifestPath = path.join(distDir, ".well-known/webcat/manifest.json");
  if (!existsSync(manifestPath)) {
    // Perfectly normal before the first signing run, and in local dev.
    return { status: "skipped", reason: "no signed manifest in the build" };
  }

  let files: Record<string, string>;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    files = (parsed.manifest ?? parsed).files ?? {};
  } catch (err) {
    return {
      status: "mismatch",
      problems: [`manifest.json is unreadable: ${(err as Error).message}`],
      checked: 0,
    };
  }

  const entries = Object.entries(files);
  if (entries.length === 0) {
    return {
      status: "mismatch",
      problems: ["the manifest lists no files"],
      checked: 0,
    };
  }

  const problems: string[] = [];
  for (const [rel, expected] of entries) {
    // Manifest paths are URL paths, always absolute and forward-slashed.
    const abs = path.join(distDir, "." + rel);
    if (!abs.startsWith(distDir + path.sep)) {
      problems.push(`${rel}: escapes the build directory`);
      continue;
    }
    if (!existsSync(abs)) {
      problems.push(`${rel}: listed in the manifest but missing from the build`);
      continue;
    }
    const got = digest(readFileSync(abs));
    if (got !== expected) {
      problems.push(`${rel}: expected ${expected}, built ${got}`);
    }
  }

  return problems.length === 0
    ? { status: "ok", fileCount: entries.length }
    : { status: "mismatch", problems, checked: entries.length };
}

/** True when this result should make the healthcheck fail. */
export function isUnhealthy(result: VerifyResult, mode: VerifyMode): boolean {
  return mode === "enforce" && result.status === "mismatch";
}

/** One-line summary for logs and the healthz body. */
export function describe(result: VerifyResult): string {
  switch (result.status) {
    case "skipped":
      return `skipped (${result.reason})`;
    case "ok":
      return `verified ${result.fileCount} files against the signed manifest`;
    case "mismatch":
      return `${result.problems.length} of ${result.checked} files do not match the signed manifest`;
  }
}
