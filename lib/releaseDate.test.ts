import { describe, expect, it } from "vitest";
import { BUILT_ON, builtOnLabel, builtOnMs } from "./releaseDate";

describe("build date", () => {
  it("comes from release.json", () => {
    expect(BUILT_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads as a date in words, the same in every time zone", () => {
    expect(builtOnLabel("2026-11-24")).toBe("November 24, 2026");
    expect(builtOnLabel("2027-01-01")).toBe("January 1, 2027");
    expect(builtOnMs("2026-11-24")).toBe(Date.UTC(2026, 10, 24));
  });
});
