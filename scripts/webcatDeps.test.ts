import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dependencyProblem } from "./webcatDeps.mjs";

/**
 * A signature over a build from drifted dependencies is a signature for bytes
 * the deploy never produces, and the only symptom is a failed healthcheck on
 * Railway. These pin the refusals that stop it at the signing step instead.
 */

let root: string;
const inSync = () => ({ ok: true });
const drifted = () => ({ ok: false, detail: "error Integrity check failed" });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "webcat-deps-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("dependencyProblem", () => {
  it("passes a yarn install that matches the lockfile", () => {
    mkdirSync(path.join(root, "node_modules"));
    expect(dependencyProblem(root, inSync)).toBeNull();
  });

  it("refuses when node_modules is missing", () => {
    expect(dependencyProblem(root, inSync)?.message).toMatch(/missing/);
  });

  it("refuses a tree pnpm has touched even if the yarn check passes", () => {
    // pnpm does not rewrite .yarn-integrity, so the yarn check alone misses it.
    mkdirSync(path.join(root, "node_modules/.pnpm"), { recursive: true });
    expect(dependencyProblem(root, inSync)?.message).toMatch(/pnpm/);
  });

  it("refuses when node_modules has drifted from yarn.lock", () => {
    mkdirSync(path.join(root, "node_modules"));
    const problem = dependencyProblem(root, drifted);
    expect(problem?.message).toMatch(/does not match yarn\.lock/);
    expect(problem?.detail).toBe("error Integrity check failed");
  });
});
