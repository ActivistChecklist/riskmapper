import { describe, expect, it } from "vitest";
import {
  bumpPatch,
  isNewerSemver,
  isValidVersion,
  nextVersion,
} from "./webcatVersion.mjs";

/**
 * The version is the only thing that makes `x-webcat-version` do anything. If
 * a signature ever carries a version that is not strictly newer than the one
 * before it, the header is sent, compared, found not-newer, and ignored — and
 * the failure surfaces as an integrity error in the browser of whoever had the
 * app open during the deploy. Nothing else in the pipeline catches that, so
 * the monotonicity is pinned here.
 */

describe("isValidVersion", () => {
  it("accepts dotted digits", () => {
    for (const v of ["0.1.0", "1.2.3", "10.0.0", "3", "1.2"]) {
      expect(isValidVersion(v), v).toBe(true);
    }
  });

  it("rejects anything the extension would read as NaN", () => {
    // Its comparison is Number() per part, so these are silently inert rather
    // than loudly wrong. Refusing them up front is the only signal.
    for (const v of ["1.2.0-rc1", "v1.2.0", "1.2.0+build", "", "1..2", "abc"]) {
      expect(isValidVersion(v), v).toBe(false);
    }
    expect(isValidVersion(undefined)).toBe(false);
    expect(isValidVersion(1.2)).toBe(false);
  });
});

describe("isNewerSemver", () => {
  it("matches the extension: missing parts count as zero", () => {
    expect(isNewerSemver("1.2", "1.2.0")).toBe(false);
    expect(isNewerSemver("1.2.0", "1.2")).toBe(false);
    expect(isNewerSemver("1.2.1", "1.2")).toBe(true);
  });

  it("compares left to right, not lexically", () => {
    expect(isNewerSemver("0.1.10", "0.1.9")).toBe(true);
    expect(isNewerSemver("0.2.0", "0.1.99")).toBe(true);
    expect(isNewerSemver("1.0.0", "0.99.99")).toBe(true);
  });

  it("is false for equal and for older", () => {
    expect(isNewerSemver("0.1.0", "0.1.0")).toBe(false);
    expect(isNewerSemver("0.1.0", "0.1.1")).toBe(false);
  });
});

describe("bumpPatch", () => {
  it("increments the last part", () => {
    expect(bumpPatch("0.1.0")).toBe("0.1.1");
    expect(bumpPatch("0.1.9")).toBe("0.1.10");
    expect(bumpPatch("3")).toBe("4");
  });
});

describe("nextVersion", () => {
  it("uses the configured version for the first signature", () => {
    expect(nextVersion(null, "0.1.0").version).toBe("0.1.0");
  });

  it("bumps the published version when the config has not moved", () => {
    // The ordinary case: several deploys between releases, nobody editing
    // package.json, and every one of them still supersedes the last.
    expect(nextVersion("0.1.0", "0.1.0").version).toBe("0.1.1");
    expect(nextVersion("0.1.7", "0.1.0").version).toBe("0.1.8");
  });

  it("respects a real release bump in the config", () => {
    expect(nextVersion("0.1.7", "0.2.0").version).toBe("0.2.0");
  });

  it("recovers when the published version is unusable", () => {
    const chosen = nextVersion("nightly", "0.1.0");
    expect(chosen.version).toBe("0.1.0");
    expect(chosen.reason).toContain("not dotted digits");
  });

  it("refuses a configured version the extension cannot compare", () => {
    expect(() => nextVersion("0.1.0", "0.2.0-rc1")).toThrow(/dotted digits/);
  });

  it("always produces something strictly newer than what was published", () => {
    const published = ["0.1.0", "0.1.9", "0.9.9", "1.0.0", "2.10.3"];
    for (const p of published) {
      for (const configured of ["0.1.0", "0.2.0", "5.0.0"]) {
        const { version } = nextVersion(p, configured);
        expect(isNewerSemver(version, p), `${p} -> ${version}`).toBe(true);
      }
    }
  });
});
