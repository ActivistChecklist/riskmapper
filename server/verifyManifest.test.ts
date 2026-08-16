import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isUnhealthy,
  verifyManifestAgainstDist,
  verifyModeFromEnv,
  type VerifyMode,
  type VerifyResult,
} from "./verifyManifest";

/**
 * The boot-time self-check that decides whether a deploy is allowed to serve
 * traffic. A false negative here is the expensive one: it would let a build
 * whose bytes disagree with the signed manifest go live, which once enrolled
 * means the extension blocks the site for exactly the users who installed it
 * because they are at risk.
 */

const dirs: string[] = [];
function makeDist(files: Record<string, string>, manifestFiles?: Record<string, string>) {
  const dist = mkdtempSync(path.join(tmpdir(), "webcat-verify-"));
  dirs.push(dist);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dist, "." + rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  if (manifestFiles !== undefined) {
    const wk = path.join(dist, ".well-known/webcat");
    mkdirSync(wk, { recursive: true });
    writeFileSync(
      path.join(wk, "manifest.json"),
      JSON.stringify({ manifest: { files: manifestFiles }, signatures: [] }),
    );
  }
  return dist;
}
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("verifyManifestAgainstDist", () => {
  it("passes when every file matches", () => {
    const dist = makeDist(
      { "/index.html": "<html>", "/assets/a.js": "console.log(1)" },
      { "/index.html": hash("<html>"), "/assets/a.js": hash("console.log(1)") },
    );
    expect(verifyManifestAgainstDist(dist)).toEqual({ status: "ok", fileCount: 2 });
  });

  it("catches a file whose bytes drifted", () => {
    // The exact failure a rebuild causes: same path, different content.
    const dist = makeDist(
      { "/assets/a.js": "console.log(2)" },
      { "/assets/a.js": hash("console.log(1)") },
    );
    const r = verifyManifestAgainstDist(dist);
    expect(r.status).toBe("mismatch");
    expect(r.status === "mismatch" && r.problems[0]).toMatch(/\/assets\/a\.js: expected/);
  });

  it("catches a file the manifest lists but the build did not produce", () => {
    const dist = makeDist({ "/index.html": "<html>" }, {
      "/index.html": hash("<html>"),
      "/assets/gone.js": hash("whatever"),
    });
    const r = verifyManifestAgainstDist(dist);
    expect(r.status).toBe("mismatch");
    expect(r.status === "mismatch" && r.problems[0]).toMatch(/missing from the build/);
  });

  it("reports every mismatch, not just the first", () => {
    const dist = makeDist(
      { "/a": "1", "/b": "2", "/c": "3" },
      { "/a": hash("x"), "/b": hash("y"), "/c": hash("3") },
    );
    const r = verifyManifestAgainstDist(dist);
    expect(r.status === "mismatch" && r.problems).toHaveLength(2);
  });

  it("skips cleanly when the build has no signed manifest", () => {
    // Normal before the first signing run and in local dev; must not fail.
    const dist = makeDist({ "/index.html": "<html>" });
    expect(verifyManifestAgainstDist(dist).status).toBe("skipped");
  });

  it("treats an unreadable manifest as a mismatch, not a skip", () => {
    const dist = makeDist({ "/index.html": "<html>" });
    const wk = path.join(dist, ".well-known/webcat");
    mkdirSync(wk, { recursive: true });
    writeFileSync(path.join(wk, "manifest.json"), "{ not json");
    expect(verifyManifestAgainstDist(dist).status).toBe("mismatch");
  });

  it("treats an empty file list as a mismatch", () => {
    // A manifest covering nothing would otherwise "pass" and prove nothing.
    const dist = makeDist({ "/index.html": "<html>" }, {});
    expect(verifyManifestAgainstDist(dist).status).toBe("mismatch");
  });

  it("refuses a manifest path that escapes the build directory", () => {
    const dist = makeDist({ "/index.html": "<html>" }, {
      "/../../etc/passwd": hash("root"),
    });
    const r = verifyManifestAgainstDist(dist);
    expect(r.status).toBe("mismatch");
    expect(r.status === "mismatch" && r.problems[0]).toMatch(/escapes the build directory/);
  });

  it("ignores extra files the manifest does not mention", () => {
    // /.well-known/ itself is deliberately unmanifested, so extras are normal.
    const dist = makeDist(
      { "/index.html": "<html>", "/extra.txt": "not listed" },
      { "/index.html": hash("<html>") },
    );
    expect(verifyManifestAgainstDist(dist).status).toBe("ok");
  });
});

describe("verifyModeFromEnv", () => {
  it("defaults to enforce, so forgetting the env var does not silently disable it", () => {
    expect(verifyModeFromEnv({})).toBe("enforce");
  });

  it("reads the three supported modes", () => {
    expect(verifyModeFromEnv({ WEBCAT_VERIFY: "off" })).toBe("off");
    expect(verifyModeFromEnv({ WEBCAT_VERIFY: "warn" })).toBe("warn");
    expect(verifyModeFromEnv({ WEBCAT_VERIFY: "enforce" })).toBe("enforce");
  });

  it("falls back to enforce on an unrecognised value rather than failing open", () => {
    // A typo like WEBCAT_VERIFY=true must not quietly drop the protection.
    expect(verifyModeFromEnv({ WEBCAT_VERIFY: "yes" })).toBe("enforce");
  });
});

describe("isUnhealthy", () => {
  const mismatch: VerifyResult = { status: "mismatch", problems: ["x"], checked: 1 };
  const ok: VerifyResult = { status: "ok", fileCount: 1 };

  it("only fails the healthcheck in enforce mode", () => {
    expect(isUnhealthy(mismatch, "enforce")).toBe(true);
    expect(isUnhealthy(mismatch, "warn")).toBe(false);
    expect(isUnhealthy(mismatch, "off")).toBe(false);
  });

  it("never fails the healthcheck on a good build", () => {
    for (const mode of ["off", "warn", "enforce"] as VerifyMode[]) {
      expect(isUnhealthy(ok, mode), mode).toBe(false);
    }
  });

  it("never fails the healthcheck when there is no manifest to check", () => {
    const skipped: VerifyResult = { status: "skipped", reason: "none" };
    expect(isUnhealthy(skipped, "enforce")).toBe(false);
  });
});
