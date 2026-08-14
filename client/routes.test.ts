import { describe, expect, it } from "vitest";
import { resolveRoute } from "./routes";

/**
 * The pathname dispatch that stands in for a router. Worth testing directly
 * because the server serves `index.html` for every unmatched path, so this
 * function is the only thing deciding whether a visitor sees the app or the
 * not-found view.
 */

describe("resolveRoute", () => {
  it("renders the app at the root", () => {
    expect(resolveRoute("/")).toBe("app");
  });

  it("renders the app when the server serves index.html directly", () => {
    expect(resolveRoute("/index.html")).toBe("app");
  });

  it("renders the app for a share link", () => {
    expect(resolveRoute("/grid/abc123def456ghij")).toBe("app");
  });

  it("tolerates a trailing slash on a share link", () => {
    expect(resolveRoute("/grid/abc123def456ghij/")).toBe("app");
  });

  it("treats a share link with no record id as not found", () => {
    expect(resolveRoute("/grid/")).toBe("not-found");
    expect(resolveRoute("/grid")).toBe("not-found");
  });

  it("treats unknown paths as not found", () => {
    for (const pathname of [
      "/nope",
      "/admin",
      "/gridlock",
      "/api/matrix",
      "/privacy/extra",
    ]) {
      expect(resolveRoute(pathname)).toBe("not-found");
    }
  });

  it("does not confuse a nested path under a share link for the app root", () => {
    // Still the app: the id is the first segment and useShareImport will
    // reject anything malformed on its own.
    expect(resolveRoute("/grid/abc/def")).toBe("app");
  });
});
