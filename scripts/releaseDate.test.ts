// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_FILE, releaseDateFor, stampReleaseDate } from "./releaseDate.mjs";

describe("stampReleaseDate", () => {
  it("writes today's UTC date where the build reads it", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "release-"));
    try {
      // Late evening in the Americas is already the next day in UTC.
      const built = stampReleaseDate(dir, new Date("2026-12-01T03:30:00Z"));
      expect(built).toBe("2026-12-01");
      expect(JSON.parse(readFileSync(path.join(dir, RELEASE_FILE), "utf8"))).toEqual({
        builtOn: "2026-12-01",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats as YYYY-MM-DD", () => {
    expect(releaseDateFor(new Date("2027-01-05T12:00:00Z"))).toBe("2027-01-05");
  });
});

describe("release.json", () => {
  it("holds a valid date the app can show", () => {
    const { builtOn } = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "..", RELEASE_FILE), "utf8"),
    ) as { builtOn: string };
    expect(builtOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${builtOn}T00:00:00Z`))).toBe(false);
  });
});
