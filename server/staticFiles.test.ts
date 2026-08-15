import { describe, expect, it } from "vitest";
import {
  SPA_FALLBACK,
  cacheControlFor,
  resolveStaticRequest,
} from "./staticFiles";

/**
 * Static resolution, with path traversal as the headline concern: this
 * function decides which bytes on disk a stranger's URL can reach.
 */

/** A stand-in build root. */
const FILES = new Set([
  "/index.html",
  "/privacy/index.html",
  "/theme-boot.js",
  "/favicon.ico",
  "/icon.svg",
  "/assets/main-Df4apONn.js",
  "/assets/globals-DlPTgAIg.css",
]);

const exists = (path: string) => FILES.has(path);
const resolve = (path: string) => resolveStaticRequest(path, exists);

describe("traversal and malformed input", () => {
  it("denies parent-directory segments", () => {
    for (const path of [
      "/../secrets.txt",
      "/assets/../../etc/passwd",
      "/..",
      "/a/b/../../../etc/passwd",
      "/privacy/../../.env",
    ]) {
      expect(resolve(path).kind, path).toBe("deny");
    }
  });

  it("denies traversal hidden behind percent-encoding", () => {
    // decodeURIComponent turns these into ".." before the segment check.
    for (const path of [
      "/%2e%2e/etc/passwd",
      "/%2E%2E/%2E%2E/etc/passwd",
      "/assets/%2e%2e/%2e%2e/.env",
    ]) {
      expect(resolve(path).kind, path).toBe("deny");
    }
  });

  it("denies malformed percent-encoding rather than guessing", () => {
    for (const path of ["/%", "/%zz", "/%e0%a4%a"]) {
      expect(resolve(path).kind, path).toBe("deny");
    }
  });

  it("denies NUL bytes, which can truncate a native path", () => {
    expect(resolve("/index.html%00.js").kind).toBe("deny");
    expect(resolve("/%00").kind).toBe("deny");
  });

  it("denies backslashes so behaviour matches across hosts", () => {
    expect(resolve("/..\\..\\etc\\passwd").kind).toBe("deny");
    expect(resolve("/assets\\main.js").kind).toBe("deny");
  });

  it("denies a non-absolute path", () => {
    expect(resolve("../etc/passwd").kind).toBe("deny");
    expect(resolve("index.html").kind).toBe("deny");
  });

  it("does not mistake legitimate dotted filenames for traversal", () => {
    // Single dots and dots inside a segment are fine; only a whole ".."
    // segment is traversal.
    expect(resolve("/assets/main-Df4apONn.js")).toEqual({
      kind: "file",
      path: "/assets/main-Df4apONn.js",
    });
    expect(resolve("/assets/globals-DlPTgAIg.css").kind).toBe("file");
  });
});

describe("directory and index resolution", () => {
  it("serves the root document for /", () => {
    expect(resolve("/")).toEqual({ kind: "file", path: "/index.html" });
  });

  it("serves a directory index for a trailing-slash path", () => {
    expect(resolve("/privacy/")).toEqual({
      kind: "file",
      path: "/privacy/index.html",
    });
  });

  it("redirects a slashless directory to its canonical trailing-slash form", () => {
    // Not a silent serve: see the WEBCAT reasoning in staticFiles.ts.
    expect(resolve("/privacy")).toEqual({
      kind: "redirect",
      location: "/privacy/",
    });
  });

  it("falls back when a trailing-slash path has no index", () => {
    expect(resolve("/nothing-here/")).toEqual({
      kind: "fallback",
      path: SPA_FALLBACK,
    });
  });
});

describe("exact files", () => {
  it("serves files that exist", () => {
    for (const path of ["/theme-boot.js", "/favicon.ico", "/icon.svg"]) {
      expect(resolve(path)).toEqual({ kind: "file", path });
    }
  });
});

describe("SPA fallback", () => {
  it("falls back for share links, whose ids can never be on disk", () => {
    expect(resolve("/grid/abc123def456ghij")).toEqual({
      kind: "fallback",
      path: SPA_FALLBACK,
    });
  });

  it("falls back for unknown paths", () => {
    for (const path of ["/nope", "/admin", "/gridlock"]) {
      expect(resolve(path).kind, path).toBe("fallback");
    }
  });

  it("never falls back to anything other than the manifested SPA document", () => {
    // WEBCAT pins a single `default_fallback`; if this ever returned a
    // different document the extension would block the response.
    const r = resolve("/anything/at/all");
    expect(r.kind === "fallback" && r.path).toBe("/index.html");
  });
});

describe("cacheControlFor", () => {
  it("caches hashed assets immutably", () => {
    expect(cacheControlFor("/assets/main-Df4apONn.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("never lets HTML be cached", () => {
    // A pinned stale document against a fresh manifest reads as tampering
    // once WEBCAT is enforcing.
    expect(cacheControlFor("/index.html")).toBe("no-cache");
    expect(cacheControlFor("/privacy/index.html")).toBe("no-cache");
  });

  it("caches other static files modestly", () => {
    expect(cacheControlFor("/theme-boot.js")).toBe("public, max-age=3600");
  });
});
