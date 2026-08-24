import { describe, expect, it } from "vitest";
import { matchApiRoute } from "./apiRoutes";

/**
 * The routing table that replaced Next's filesystem routes. The behaviour
 * that matters most: every /api path resolves inside this table, so a client
 * expecting JSON can never be handed the SPA's HTML instead.
 */

const VALID_ID = "abcd1234efgh5678ijkl";

describe("matchApiRoute", () => {
  it("routes each endpoint the client actually calls", () => {
    expect(matchApiRoute("GET", "/api/healthz")).toEqual({
      kind: "match",
      route: "healthz",
    });
    expect(matchApiRoute("POST", "/api/counter")).toEqual({
      kind: "match",
      route: "counter",
    });
    expect(matchApiRoute("POST", "/api/matrix")).toEqual({
      kind: "match",
      route: "matrixCreate",
    });
    expect(matchApiRoute("GET", `/api/matrix/${VALID_ID}`)).toEqual({
      kind: "match",
      route: "matrixRead",
      id: VALID_ID,
    });
    expect(matchApiRoute("DELETE", `/api/matrix/${VALID_ID}`)).toEqual({
      kind: "match",
      route: "matrixDelete",
      id: VALID_ID,
    });
    expect(matchApiRoute("POST", `/api/matrix/${VALID_ID}/updates`)).toEqual({
      kind: "match",
      route: "matrixUpdates",
      id: VALID_ID,
    });
    expect(matchApiRoute("PUT", `/api/matrix/${VALID_ID}/baseline`)).toEqual({
      kind: "match",
      route: "matrixBaseline",
      id: VALID_ID,
    });
    expect(matchApiRoute("GET", `/api/matrix/${VALID_ID}/events`)).toEqual({
      kind: "match",
      route: "matrixEvents",
      id: VALID_ID,
    });
  });

  it("leaves non-API paths to static resolution", () => {
    for (const path of ["/", "/privacy/", "/security/", "/grid/abc", "/assets/main.js"]) {
      expect(matchApiRoute("GET", path).kind, path).toBe("notApi");
    }
  });

  it("does not treat a lookalike prefix as an API path", () => {
    expect(matchApiRoute("GET", "/apifoo").kind).toBe("notApi");
    expect(matchApiRoute("GET", "/api-docs").kind).toBe("notApi");
  });

  it("404s unknown API paths instead of falling through to the SPA", () => {
    // The important one: an unmatched /api/* must never return HTML.
    for (const path of [
      "/api",
      "/api/",
      "/api/nope",
      "/api/matrix/x/unknown",
      `/api/matrix/${VALID_ID}/nope`,
    ]) {
      expect(matchApiRoute("GET", path).kind, path).toBe("notFound");
    }
  });

  it("rejects implausible record ids at the router, before Mongo", () => {
    for (const id of ["short", "", "has spaces", "a".repeat(65), "id.with.dots"]) {
      const path = `/api/matrix/${id}`;
      expect(matchApiRoute("GET", path).kind, path).toBe("notFound");
    }
  });

  it("reports the wrong verb as method-not-allowed, not as missing", () => {
    expect(matchApiRoute("DELETE", "/api/matrix")).toEqual({
      kind: "methodNotAllowed",
      allow: ["POST"],
    });
    const read = matchApiRoute("PUT", `/api/matrix/${VALID_ID}`);
    expect(read.kind).toBe("methodNotAllowed");
    expect(read.kind === "methodNotAllowed" && read.allow.sort()).toEqual([
      "DELETE",
      "GET",
    ]);
  });

  it("does not let a trailing slash bypass the table", () => {
    expect(matchApiRoute("POST", "/api/matrix/").kind).toBe("notFound");
    expect(matchApiRoute("GET", `/api/matrix/${VALID_ID}/`).kind).toBe(
      "notFound",
    );
  });
});
