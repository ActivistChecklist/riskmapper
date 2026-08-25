import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSignedManifestVersion, WEBCAT_VERSION_HEADER } from "./webcatVersion";

/**
 * What the server announces to a WEBCAT client. Getting this wrong is quiet:
 * a missing or unusable header does not break anything visible, it just leaves
 * anyone who had the app open when a deploy landed stuck on an integrity error
 * until they restart their browser.
 */

const dirs: string[] = [];
function makeDist(manifest?: unknown) {
  const dist = mkdtempSync(path.join(tmpdir(), "webcat-version-"));
  dirs.push(dist);
  if (manifest !== undefined) {
    const wk = path.join(dist, ".well-known/webcat");
    mkdirSync(wk, { recursive: true });
    writeFileSync(
      path.join(wk, "manifest.json"),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    );
  }
  return dist;
}

const quiet = () => ({ error: vi.fn(), log: vi.fn() }) as unknown as Console;

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("readSignedManifestVersion", () => {
  it("reads the version out of a signed manifest", () => {
    const dist = makeDist({ manifest: { version: "0.1.4", files: {} }, signatures: [] });
    expect(readSignedManifestVersion(dist)).toBe("0.1.4");
  });

  it("reads an unwrapped manifest too", () => {
    // webcat-cli writes the signed form wrapped in `manifest`; the unsigned
    // form is flat. verifyManifest.ts accepts both, so this does as well.
    expect(readSignedManifestVersion(makeDist({ version: "2.0.1", files: {} }))).toBe("2.0.1");
  });

  it("sends nothing when the build carries no manifest", () => {
    // A fresh clone and local dev, where announcing a version nothing was
    // signed under would be a lie.
    expect(readSignedManifestVersion(makeDist())).toBe(null);
  });

  it("sends nothing when the manifest is unreadable", () => {
    const log = quiet();
    expect(readSignedManifestVersion(makeDist("{ not json"), log)).toBe(null);
    expect(log.error).toHaveBeenCalled();
  });

  it("refuses a version the extension would read as NaN, loudly", () => {
    // The extension parses each part with Number(), so a prerelease suffix
    // compares false against everything. Sending it would look like the
    // feature working while doing nothing at all.
    for (const version of ["0.2.0-rc1", "v1.0.0", "", "latest"]) {
      const log = quiet();
      const dist = makeDist({ manifest: { version, files: {} } });
      expect(readSignedManifestVersion(dist, log), version).toBe(null);
      expect(log.error, version).toHaveBeenCalled();
    }
  });

  it("refuses a non-string version", () => {
    const log = quiet();
    expect(readSignedManifestVersion(makeDist({ manifest: { version: 1 } }), log)).toBe(null);
  });

  it("names the header the extension actually looks for", () => {
    // Case-insensitive on the wire, but a typo here is a silent no-op.
    expect(WEBCAT_VERSION_HEADER.toLowerCase()).toBe("x-webcat-version");
  });
});
