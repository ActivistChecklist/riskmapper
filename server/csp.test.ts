import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  parsePolicy,
  validateWebcatCsp,
} from "./csp";

/**
 * Two jobs here.
 *
 * First, pin the policy the app actually ships, so a source cannot be added
 * or dropped without someone deciding to. Every entry was established by
 * measuring the running app; `'wasm-unsafe-eval'` in particular is load
 * bearing, because libsodium aborts when WebAssembly is blocked and every
 * cloud share would break.
 *
 * Second, encode WEBCAT's constraints as executable rules. Once the domain is
 * enrolled, a policy the extension rejects does not degrade gracefully — it
 * blocks the site. Better to fail here.
 */

describe("the shipped policy", () => {
  const directives = parsePolicy(CONTENT_SECURITY_POLICY);

  it("satisfies every WEBCAT constraint", () => {
    expect(validateWebcatCsp(CONTENT_SECURITY_POLICY)).toEqual([]);
  });

  it("denies everything by default", () => {
    expect(directives.get("default-src")).toEqual(["'none'"]);
  });

  it("allows WebAssembly, which libsodium requires to encrypt", () => {
    // Without this, getSodium() aborts and cloud sharing fails outright.
    expect(directives.get("script-src")).toEqual([
      "'self'",
      "'wasm-unsafe-eval'",
    ]);
  });

  it("allows inline styles, which sonner, tiptap and Radix all inject", () => {
    expect(directives.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("keeps the app same-origin for scripts, styles, fonts and fetches", () => {
    for (const name of ["script-src", "style-src", "font-src", "connect-src"]) {
      const values = directives.get(name) ?? [];
      expect(values, name).toContain("'self'");
      // No third-party host anywhere. This is the assertion that would have
      // caught the PDF renderer fetching Roboto from cdn.jsdelivr.net.
      expect(values.some((v) => v.includes("//")), name).toBe(false);
    }
  });

  it("allows data: for connect-src only, for react-pdf's inline wasm", () => {
    expect(directives.get("connect-src")).toEqual(["'self'", "data:"]);
    // Not anywhere it would let content be injected.
    expect(directives.get("script-src")).not.toContain("data:");
    expect(directives.get("img-src")).not.toContain("data:");
  });

  it("blocks framing, objects, workers and form posts", () => {
    expect(directives.get("frame-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("worker-src")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("is a single policy with no duplicate directives", () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain(",");
    const names = CONTENT_SECURITY_POLICY.split(";").map((d) =>
      d.trim().split(/\s+/)[0],
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("validateWebcatCsp catches what WEBCAT rejects", () => {
  it("rejects script hashes, which browsers accept but WEBCAT does not", () => {
    const problems = validateWebcatCsp(
      "default-src 'none'; script-src 'self' 'sha256-abc123'",
    );
    expect(problems.join(" ")).toMatch(/script hashes and nonces/);
  });

  it("rejects script nonces", () => {
    expect(
      validateWebcatCsp("default-src 'none'; script-src 'self' 'nonce-abc'"),
    ).not.toEqual([]);
  });

  it("rejects unsafe-eval", () => {
    expect(
      validateWebcatCsp("default-src 'none'; script-src 'self' 'unsafe-eval'"),
    ).not.toEqual([]);
  });

  it("rejects unsafe-inline for scripts", () => {
    expect(
      validateWebcatCsp("default-src 'none'; script-src 'self' 'unsafe-inline'"),
    ).not.toEqual([]);
  });

  it("rejects a third-party script host", () => {
    expect(
      validateWebcatCsp(
        "default-src 'none'; script-src 'self' https://cdn.example.com",
      ),
    ).not.toEqual([]);
  });

  it("rejects a default-src that is neither none nor self", () => {
    expect(validateWebcatCsp("default-src *")).not.toEqual([]);
  });

  it("requires object-src, worker-src and frame-src when default-src is self", () => {
    const problems = validateWebcatCsp("default-src 'self'");
    expect(problems.join(" ")).toMatch(/object-src/);
    expect(problems.join(" ")).toMatch(/worker-src/);
    expect(problems.join(" ")).toMatch(/frame-src or child-src/);
  });

  it("does not demand those when default-src is none", () => {
    expect(validateWebcatCsp("default-src 'none'")).toEqual([]);
  });

  it("rejects a worker-src other than none or self", () => {
    expect(
      validateWebcatCsp("default-src 'none'; worker-src blob:"),
    ).not.toEqual([]);
  });

  it("rejects an object-src that is not none", () => {
    expect(
      validateWebcatCsp("default-src 'none'; object-src 'self'"),
    ).not.toEqual([]);
  });

  it("rejects a non-enrolled frame host", () => {
    expect(
      validateWebcatCsp("default-src 'none'; frame-src https://other.example"),
    ).not.toEqual([]);
  });

  it("rejects comma-joined policies", () => {
    expect(
      validateWebcatCsp("default-src 'none', script-src 'self'"),
    ).not.toEqual([]);
  });

  it("flags duplicate directives", () => {
    expect(
      validateWebcatCsp("default-src 'none'; script-src 'self'; script-src 'none'"),
    ).not.toEqual([]);
  });

  it("allows style hashes, which WEBCAT does permit", () => {
    expect(
      validateWebcatCsp("default-src 'none'; style-src 'sha256-abc123'"),
    ).toEqual([]);
  });
});
