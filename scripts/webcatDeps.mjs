/**
 * Refuse to sign a build made from dependencies Railway will not use.
 *
 * The manifest is a list of hashes of the files `yarn build` writes, and the
 * deploy rebuilds those files from scratch with `yarn install` against
 * `yarn.lock`. A local `node_modules` that has drifted from the lockfile
 * therefore produces a signature for bytes the deploy never builds. The
 * server's startup check then fails the healthcheck, and the new code never
 * ships, but nothing local says why.
 *
 * This happened: a checkout last installed before a dependency bump (Vite
 * 8.2.1 against a lockfile pinning 8.3.4) signed a build that differed from
 * Railway's in every chunk name. Running `pnpm` in the repo makes the same
 * mess a different way, by restructuring `node_modules` into its own layout.
 *
 * Kept free of process exits and output so it can be tested without signing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const REINSTALL = "rm -rf node_modules && yarn install";

/** yarn 1 compares node_modules/.yarn-integrity against yarn.lock. */
function yarnIntegrity(root) {
  const res = spawnSync("yarn", ["check", "--integrity"], {
    cwd: root,
    encoding: "utf8",
  });
  if (res.error) return { ok: false, detail: res.error.message };
  return { ok: res.status === 0, detail: res.stderr || res.stdout };
}

/**
 * @param {string} root repository root
 * @param {(root: string) => { ok: boolean, detail?: string }} [checkIntegrity]
 * @returns {{ message: string, detail?: string } | null} null when in sync
 */
export function dependencyProblem(root, checkIntegrity = yarnIntegrity) {
  if (!existsSync(path.join(root, "node_modules"))) {
    return { message: `node_modules is missing. Run: ${REINSTALL}` };
  }
  // pnpm leaves .yarn-integrity alone, so the yarn check below can pass over
  // a tree pnpm has rearranged.
  if (existsSync(path.join(root, "node_modules/.pnpm"))) {
    return {
      message:
        "node_modules was modified by pnpm, but this repo uses yarn.\n" +
        `  Run: ${REINSTALL}`,
    };
  }
  const res = checkIntegrity(root);
  if (!res.ok) {
    return {
      message:
        "node_modules does not match yarn.lock, so this build would differ\n" +
        "  from the one the deploy makes and the signature would not match it.\n" +
        `  Run: ${REINSTALL}`,
      detail: res.detail,
    };
  }
  return null;
}
