import { describe, expect, it } from "vitest";
import { formatAllMitigationsMarkdown } from "./mitigationsMarkdown";
import type { CellKey, GridLine } from "./types";

describe("formatAllMitigationsMarkdown", () => {
  it("returns empty string when nothing to export", () => {
    expect(formatAllMitigationsMarkdown({})).toBe("");
    expect(
      formatAllMitigationsMarkdown({
        "0-0": [{ id: "a", text: "Only risk", reduce: [], prepare: [] }],
      } as Record<CellKey, GridLine[]>),
    ).toBe("");
  });

  it("groups by cell then risk with reductions and preparations", () => {
    const grid = {
      "0-2": [
        {
          id: "r1",
          text: "Data breach",
          reduce: [{ id: "s1", text: "Encrypt PII", starred: false }],
          prepare: [
            { id: "s2", text: "Incident runbooks", starred: false },
          ],
        },
      ],
      "2-0": [
        {
          id: "r2",
          text: "Vendor delay",
          reduce: [{ id: "s3", text: "Dual-source", starred: false }],
        },
      ],
    } as Record<CellKey, GridLine[]>;
    const md = formatAllMitigationsMarkdown(grid);
    expect(md).toMatch(/^# All mitigations\n\n/);
    expect(md).toContain("## High likelihood · High impact");
    expect(md).toContain("### Data breach");
    expect(md).toContain("**Reductions**");
    expect(md).toContain("- Encrypt PII");
    expect(md).toContain("**Preparations**");
    expect(md).toContain("- Incident runbooks");
    expect(md).toContain("## Low likelihood · Low impact");
    expect(md).toContain("### Vendor delay");
    expect(md).toContain("- Dual-source");
    const hiIdx = md.indexOf("High likelihood · High impact");
    const loIdx = md.indexOf("Low likelihood · Low impact");
    expect(hiIdx).toBeLessThan(loIdx);
  });

  it("escapes bullet-like mitigation text", () => {
    const md = formatAllMitigationsMarkdown({
      "1-1": [
        {
          id: "r",
          text: "X",
          reduce: [{ id: "s", text: "- looks like a list", starred: false }],
        },
      ],
    } as Record<CellKey, GridLine[]>);
    expect(md).toContain("- \\- looks like a list");
  });
});
