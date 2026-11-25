import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRateLimitKey, RATE_LIMIT_KEY, rateLimitKeyCandidates } from "./rateLimitKey.mjs";

/**
 * Signing from a worktree once found no key, submitted anonymously, and was
 * rejected with a 429 only after the YubiKey touch. These pin the lookup that
 * finds the main checkout's key instead.
 */

let dir: string;
const putKey = (root: string) => {
  mkdirSync(path.join(root, "webcat"), { recursive: true });
  writeFileSync(path.join(root, RATE_LIMIT_KEY), "key", { mode: 0o600 });
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "ignore" });

beforeEach(() => {
  // realpath: macOS tmpdir is a symlink, and git reports the resolved path.
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), "rate-limit-key-")));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("findRateLimitKey", () => {
  it("finds the key in the main checkout when run from a worktree", () => {
    const main = path.join(dir, "main");
    const worktree = path.join(dir, "worktree");
    mkdirSync(main);
    git(main, "init", "-q");
    git(main, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "init");
    git(main, "worktree", "add", "-q", worktree);
    putKey(main);

    expect(findRateLimitKey(worktree)).toBe(path.join(main, RATE_LIMIT_KEY));
  });

  it("prefers this checkout's own key", () => {
    const main = path.join(dir, "main");
    const worktree = path.join(dir, "worktree");
    putKey(main);
    putKey(worktree);
    expect(findRateLimitKey(worktree, path.join(main, ".git"))).toBe(
      path.join(worktree, RATE_LIMIT_KEY),
    );
  });

  it("returns null when no checkout has the key", () => {
    const main = path.join(dir, "main");
    mkdirSync(main);
    expect(findRateLimitKey(path.join(dir, "worktree"), path.join(main, ".git"))).toBeNull();
  });

  it("looks only in this checkout outside git or in a bare repository", () => {
    expect(rateLimitKeyCandidates(dir, null)).toEqual([path.join(dir, RATE_LIMIT_KEY)]);
    expect(rateLimitKeyCandidates(dir, path.join(dir, "repo.git"))).toEqual([
      path.join(dir, RATE_LIMIT_KEY),
    ]);
  });

  it("lists the main checkout once when run from it", () => {
    expect(rateLimitKeyCandidates(dir, path.join(dir, ".git"))).toEqual([
      path.join(dir, RATE_LIMIT_KEY),
    ]);
  });
});
