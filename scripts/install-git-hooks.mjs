#!/usr/bin/env node
/**
 * Point this repo's git at `.githooks/`.
 *
 *   yarn hooks:install
 *
 * Also runs from `prepare`, so a fresh clone gets the hooks on `yarn install`.
 *
 * It has to set `core.hooksPath` rather than drop files in `.git/hooks/`,
 * because anyone with a *global* `core.hooksPath` never reads `.git/hooks/`
 * at all. The flip side is that the local setting shadows the global
 * directory completely, so `.githooks/` carries a passthrough for each global
 * hook; anything global without one is warned about here.
 *
 * Never fails an install. It runs during `yarn install` in places with no git
 * repo at all, such as the Railway build image.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOOKS_DIR = ".githooks";

function git(args) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return res.status === 0 ? (res.stdout ?? "").trim() : null;
}

function main() {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return;
  if (!existsSync(path.join(ROOT, HOOKS_DIR))) return;

  const current = git(["config", "--local", "--get", "core.hooksPath"]);
  if (current !== HOOKS_DIR) {
    if (git(["config", "core.hooksPath", HOOKS_DIR]) === null) return;
    console.log(`git hooks: core.hooksPath -> ${HOOKS_DIR}`);
  }

  // Warn about global hooks this repo would now be skipping.
  let globalDir = git(["config", "--global", "--get", "core.hooksPath"]);
  if (!globalDir) return;
  if (globalDir.startsWith("~")) globalDir = process.env.HOME + globalDir.slice(1);
  if (!existsSync(globalDir)) return;

  const missing = readdirSync(globalDir).filter((name) => {
    const full = path.join(globalDir, name);
    if (!statSync(full).isFile() || !(statSync(full).mode & 0o111)) return false;
    if (name.endsWith(".sample") || name.includes(".")) return false;
    return !existsSync(path.join(ROOT, HOOKS_DIR, name));
  });

  if (missing.length > 0) {
    console.warn(
      `git hooks: your global hooks (${globalDir}) contain ` +
        `${missing.join(", ")} with no passthrough in ${HOOKS_DIR}/, ` +
        "so they will not run in this repo.",
    );
  }
}

try {
  main();
} catch (err) {
  // A broken hook install is not a reason to fail `yarn install`.
  console.warn(`git hooks: skipped (${err?.message ?? err})`);
}
