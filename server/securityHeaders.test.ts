import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./csp";

/**
 * Every response must carry a Content-Security-Policy header, not just the
 * files served off disk.
 *
 * This is a regression test for a real outage. WEBCAT treats a missing CSP as
 * `ERR_WEBCAT_HEADERS_MISSING_CRITICAL` and blocks the page outright, and it
 * inspects redirects, API responses and error pages — not only documents. The
 * server originally set the header inside its file-serving path, so the 301
 * from `/privacy` to `/privacy/`, every `/api/*` response and every 404 went
 * out bare. Enrolled users got a block page.
 *
 * Runs the real built server, because the bug lived in the wiring between
 * response paths rather than in any single handler.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

beforeAll(async () => {
  server = spawn("node", [path.join(ROOT, "dist-server/index.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), WEBCAT_VERIFY: "off" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${BASE}/api/healthz`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("built server did not start; run `yarn build` first");
}, 30_000);

afterAll(() => {
  server?.kill();
});

/** Redirects must be inspected as-is; following them hides the bug. */
const raw = (p: string) => fetch(`${BASE}${p}`, { redirect: "manual" });

describe("Content-Security-Policy on every response", () => {
  const paths = [
    ["/", "the SPA document"],
    ["/privacy/", "the privacy document"],
    ["/privacy", "the 301 redirect — a main_frame response"],
    ["/grid/abc123def456ghij", "a share link (SPA fallback)"],
    ["/nope", "an unknown path (SPA fallback)"],
    ["/theme-boot.js", "the pre-paint script"],
    ["/api/healthz", "an API response"],
    ["/api/nope", "an API 404"],
    ["/.well-known/webcat/nope.json", "a well-known 404"],
    ["/../etc/passwd", "a rejected traversal (400)"],
  ] as const;

  it.each(paths)("%s sends a CSP header (%s)", async (p) => {
    const res = await raw(p);
    expect(res.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
  });

  it("never sends two CSP headers, which WEBCAT also rejects", async () => {
    for (const [p] of paths) {
      const value = (await raw(p)).headers.get("content-security-policy");
      // fetch joins repeated headers with ", ", so a duplicate would show up
      // as a comma in the single value. Our policy contains none.
      expect(value?.includes(","), p).toBe(false);
    }
  });

  it("sends the hardening headers everywhere too", async () => {
    for (const [p] of paths) {
      const res = await raw(p);
      expect(res.headers.get("x-content-type-options"), p).toBe("nosniff");
      expect(res.headers.get("referrer-policy"), p).toBe("no-referrer");
    }
  });

  it("still sets the right status codes", async () => {
    expect((await raw("/privacy")).status).toBe(301);
    expect((await raw("/grid/abc123def456ghij")).status).toBe(200);
    expect((await raw("/api/nope")).status).toBe(404);
  });
});
