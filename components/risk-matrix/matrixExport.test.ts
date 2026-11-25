import { describe, expect, it } from "vitest";
import {
  buildFullPlainReport,
  buildSummaryPlain,
  canCopyResources,
  formatResourcesPlain,
} from "./matrixExport";
import { emptyGrid } from "./riskMatrixUtils";

const RESOURCES = [
  { id: "r1", text: "  Two trained medics " },
  { id: "r2", text: "" },
  { id: "r3", text: "Van for the support team" },
];

describe("resources in the plain-text exports", () => {
  it("formats step 3's list as bullets, skipping blank entries", () => {
    expect(formatResourcesPlain(RESOURCES)).toBe(
      "- Two trained medics\n- Van for the support team",
    );
    expect(formatResourcesPlain([{ id: "r", text: " " }])).toBe(
      "(No resources listed.)",
    );
  });

  it("only offers Copy when a resource has text", () => {
    expect(canCopyResources(RESOURCES)).toBe(true);
    expect(canCopyResources([{ id: "r", text: "  " }])).toBe(false);
    expect(canCopyResources([])).toBe(false);
  });

  it("puts resources between the matrix and the plan in the full worksheet", () => {
    const report = buildFullPlainReport({
      title: "March",
      pool: [],
      grid: emptyGrid(),
      resources: RESOURCES,
      allActions: [],
      otherActions: [],
    });
    const headings = report.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual([
      "## Risk pool",
      "## Risk matrix",
      "## Resources",
      "## Mitigations & preparations",
      "## Actions",
    ]);
    expect(report).toContain(
      "## Resources\n\n- Two trained medics\n- Van for the support team\n\n## Mitigations",
    );
  });

  it("reads a matrix saved before resources existed as having none", () => {
    const report = buildFullPlainReport({
      title: "March",
      pool: [],
      grid: emptyGrid(),
      allActions: [],
      otherActions: [],
    });
    expect(report).toContain("## Resources\n\n(No resources listed.)");
  });

  it("counts resources in the summary", () => {
    const summary = buildSummaryPlain({
      title: "March",
      pool: [],
      grid: emptyGrid(),
      resources: RESOURCES,
      allActions: [],
      otherActions: [],
    });
    expect(summary).toContain("## Resources\n\n- Total resources: 2");
  });
});
