/**
 * Where `yarn webcat:sign` finds the Sigsum rate-limit key.
 *
 * The key is gitignored, so git never copies it into a worktree. Signing from
 * a worktree used to find no key, fall back to an anonymous submission, and
 * fail with "(429) rate-limit for unknown domain exceeded" only after the
 * YubiKey touch, once the logs' shared anonymous quota was spent. So the
 * lookup also tries the main checkout, and signing refuses to start when
 * neither has the key.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** Relative to a checkout's root. */
export const RATE_LIMIT_KEY = "webcat/rate-limit-key";

/** The repository's shared .git directory, which a worktree points back to. */
function gitCommonDir(root) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    // Not a git checkout: only `root` itself can hold the key.
    return null;
  }
}

/**
 * Paths to try, in order: this checkout, then the main checkout when this is
 * a worktree. A bare repository's common dir has no checkout next to it.
 */
export function rateLimitKeyCandidates(root, commonDir = gitCommonDir(root)) {
  const roots = [path.resolve(root)];
  if (commonDir && path.basename(commonDir) === ".git") {
    roots.push(path.dirname(path.resolve(commonDir)));
  }
  return [...new Set(roots)].map((r) => path.join(r, RATE_LIMIT_KEY));
}

/** The first candidate that exists, or null. */
export function findRateLimitKey(root, commonDir) {
  return rateLimitKeyCandidates(root, commonDir).find((p) => existsSync(p)) ?? null;
}
