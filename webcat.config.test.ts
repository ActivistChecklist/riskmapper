import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, validateWebcatCsp } from "./server/csp";
import { SPA_FALLBACK } from "./server/staticFiles";

/**
 * `webcat.config.json` holds the decisions a human makes about the manifest:
 * the CSP, the fallback document, the version. Three of them restate things
 * that live in code, so this pins them together — if they drift, extension
 * users get different behaviour from everyone else, and the first symptom is
 * a blocked site.
 *
 * It is committed rather than generated on purpose: it is the app's security
 * policy and belongs in a reviewable diff. The one field the build owns is
 * `wasm`, which is derived from the emitted bundle on every build (see the
 * plugin in vite.config.mts) because those digests change silently whenever
 * libsodium or react-pdf is upgraded.
 */

const config = JSON.parse(
  readFileSync(path.resolve(__dirname, "webcat.config.json"), "utf8"),
) as {
  app: string;
  version: string;
  default_csp: string;
  default_index: string;
  default_fallback: string;
  wasm?: string[];
  extra_csp: Record<string, string>;
};

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

describe("webcat.config.json", () => {
  it("declares the same CSP the server sends", () => {
    // The single most important assertion here. The server sends this header
    // on every static response; the extension enforces the manifest copy.
    expect(config.default_csp).toBe(CONTENT_SECURITY_POLICY);
  });

  it("declares a CSP that WEBCAT will accept", () => {
    expect(validateWebcatCsp(config.default_csp)).toEqual([]);
  });

  it("falls back to the document the server actually serves", () => {
    // server/staticFiles.ts serves SPA_FALLBACK for unmatched main_frame
    // paths, including share links, whose ids can never be in the manifest.
    // If these disagree, every share link is blocked. See MIGRATION.md D3.
    expect(config.default_fallback).toBe(SPA_FALLBACK);
  });

  it("resolves the root to the SPA document", () => {
    expect(config.default_index).toBe("index.html");
  });

  it("tracks the package version", () => {
    // Bump both together at release so a manifest can be traced to a build.
    //
    // This is the floor, not the manifest's version: `yarn webcat:sign` bumps
    // the patch past whatever was last published, because a version that does
    // not move makes x-webcat-version inert and leaves anyone mid-session
    // blocked after a deploy. See scripts/webcatVersion.mjs. Bumping here
    // still wins when it is genuinely ahead, which is how a release lands.
    expect(config.version).toBe(pkg.version);
  });

  it("points at the upstream project for auditability", () => {
    expect(config.app).toMatch(/^https:\/\/github\.com\//);
  });

  it("does not hand-declare wasm digests", () => {
    // Deliberately absent. A committed digest goes stale the moment libsodium
    // or react-pdf is upgraded, and a stale one blocks the site for enrolled
    // users. The build derives it instead, into webcat.config.generated.json.
    expect(config.wasm).toBeUndefined();
  });

  it("needs no per-path CSP overrides", () => {
    // Both documents run the same app; if this ever grows an entry, the
    // override has to satisfy validateWebcatCsp too.
    expect(config.extra_csp).toEqual({});
  });
});
