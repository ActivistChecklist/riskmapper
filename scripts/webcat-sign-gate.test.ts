import { describe, expect, it } from "vitest";

import {
  buildFilesOnly,
  deployRefUpdate,
  isAccept,
  isDecline,
  isNonBuildPath,
  parsePushRefs,
  pushRefspecs,
} from "./webcat-sign-gate.mjs";

const SHA = "a1c2278f0e2f4a1b9c8d7e6f5a4b3c2d1e0f9a8b";
const ZERO = "0".repeat(40);

describe("webcat sign gate", () => {
  describe("push refs", () => {
    it("parses the four fields git writes per ref", () => {
      const refs = parsePushRefs(`refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
      expect(refs).toEqual([
        {
          localRef: "refs/heads/main",
          localSha: SHA,
          remoteRef: "refs/heads/main",
          remoteSha: ZERO,
        },
      ]);
    });

    it("survives an empty ref list", () => {
      expect(parsePushRefs("")).toEqual([]);
      expect(parsePushRefs(undefined)).toEqual([]);
      expect(deployRefUpdate(parsePushRefs("\n\n"))).toBe(null);
    });

    it("only cares about a push that lands on main", () => {
      const refs = parsePushRefs(
        `refs/heads/feature ${SHA} refs/heads/feature ${ZERO}\n` +
          `refs/tags/v1 ${SHA} refs/tags/v1 ${ZERO}\n`,
      );
      expect(deployRefUpdate(refs)).toBe(null);
    });

    it("finds main among several refs", () => {
      const refs = parsePushRefs(
        `refs/heads/feature ${SHA} refs/heads/feature ${ZERO}\n` +
          `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`,
      );
      expect(deployRefUpdate(refs)?.localSha).toBe(SHA);
    });

    it("ignores a branch deletion, which has nothing to sign", () => {
      const refs = parsePushRefs(`(delete) ${ZERO} refs/heads/main ${SHA}\n`);
      expect(deployRefUpdate(refs)).toBe(null);
    });

    it("asks about a push of main from a differently named local branch", () => {
      // `git push origin hotfix:main` still deploys.
      const refs = parsePushRefs(`refs/heads/hotfix ${SHA} refs/heads/main ${ZERO}\n`);
      expect(deployRefUpdate(refs)?.localSha).toBe(SHA);
    });
  });

  describe("the push it makes after signing", () => {
    const OTHER = "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5";

    it("sends the deploy branch by name, so it carries the new commit", () => {
      const refs = parsePushRefs(`refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`);
      expect(pushRefspecs(refs, deployRefUpdate(refs))).toEqual([
        "refs/heads/main:refs/heads/main",
      ]);
    });

    it("pins every other ref to the sha git already resolved", () => {
      const refs = parsePushRefs(
        `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n` +
          `refs/heads/side ${OTHER} refs/heads/side ${ZERO}\n`,
      );
      expect(pushRefspecs(refs, deployRefUpdate(refs))).toEqual([
        "refs/heads/main:refs/heads/main",
        `${OTHER}:refs/heads/side`,
      ]);
    });

    it("replays a deletion as a bare colon refspec", () => {
      const refs = parsePushRefs(
        `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n` +
          `(delete) ${ZERO} refs/heads/gone ${OTHER}\n`,
      );
      expect(pushRefspecs(refs, deployRefUpdate(refs))).toEqual([
        "refs/heads/main:refs/heads/main",
        ":refs/heads/gone",
      ]);
    });
  });

  describe("which files invalidate a signature", () => {
    it("treats build-adjacent tooling as build-affecting", () => {
      // scripts/wasmDigests.mts feeds the build, and server/ shares lib/ with
      // the client bundle, so neither is safe to wave through.
      for (const file of [
        "client/App.tsx",
        "scripts/wasmDigests.mts",
        "server/csp.ts",
        "lib/e2ee/crypto.ts",
        "public/theme-boot.js",
        "vite.config.mts",
        "package.json",
        "docs/nested/notes.md",
      ]) {
        expect(isNonBuildPath(file), file).toBe(false);
      }
    });

    it("treats prose and repo plumbing as non-build", () => {
      for (const file of [
        "README.md",
        "AGENTS.md",
        "LICENSE",
        ".gitignore",
        ".claude/settings.json",
        ".github/workflows/webcat-verify.yml",
        ".githooks/pre-push",
      ]) {
        expect(isNonBuildPath(file), file).toBe(true);
      }
    });

    it("keeps only the files that can change dist/", () => {
      expect(buildFilesOnly(["README.md", "client/App.tsx", "", "LICENSE"])).toEqual([
        "client/App.tsx",
      ]);
    });

    it("keeps the sentinels, so an unknown state still asks", () => {
      expect(buildFilesOnly(["<unknown>", "<never signed>"])).toHaveLength(2);
    });
  });

  describe("reading answers", () => {
    it("reads only an explicit no as a refusal", () => {
      for (const answer of ["n", "N", "no", "No", " no "]) {
        expect(isDecline(answer), answer).toBe(true);
      }
      // "Sign it now? [Y/n]" defaults to yes, so Enter means sign.
      for (const answer of ["", "y", "yes", "sure", null, undefined]) {
        expect(isDecline(answer), String(answer)).toBe(false);
      }
    });

    it("reads only an explicit yes as consent", () => {
      for (const answer of ["y", "Y", "yes", "Yes", " yes "]) {
        expect(isAccept(answer), answer).toBe(true);
      }
      // "Push unsigned anyway? [y/N]" defaults to no, so Enter stops the push.
      for (const answer of ["", "n", "nope", "ok", null, undefined]) {
        expect(isAccept(answer), String(answer)).toBe(false);
      }
    });
  });
});
