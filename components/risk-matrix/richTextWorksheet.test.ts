import { describe, expect, it } from "vitest";
import { starredActionsFromGrid } from "./actionGroups";
import { MITIGATION_PROMPTS } from "./constants";
import { buildRichWorksheetHtml } from "./richTextWorksheet";
import { emptyGrid } from "./riskMatrixUtils";

function sample() {
  const grid = emptyGrid();
  grid["0-2"] = [
    {
      id: "r1",
      text: "Doxxing of organizers",
      reduce: [{ id: "a", text: "Lock down social media", starred: true }],
      prepare: [{ id: "b", text: "Data broker removal", starred: false }],
    },
  ];
  return grid;
}

describe("buildRichWorksheetHtml", () => {
  it("lays step 3 out per risk with both questions under it", () => {
    const grid = sample();
    const html = buildRichWorksheetHtml({
      title: "March",
      pool: [],
      grid,
      allActions: starredActionsFromGrid(grid),
      otherActions: [],
      notes: "",
    });
    const step3 = html.slice(html.indexOf("Mitigations"), html.indexOf(">Actions<"));
    expect(step3).toContain("Highest risk (1)");
    expect(step3).toContain("Doxxing of organizers");
    expect(step3).toContain(MITIGATION_PROMPTS.reduce);
    expect(step3).toContain(MITIGATION_PROMPTS.prepare);
    expect(step3).toContain("★ Lock down social media");
    expect(step3).toContain("• Data broker removal");
  });

  it("lists actions by tier without the source risk", () => {
    const grid = sample();
    const html = buildRichWorksheetHtml({
      title: "March",
      pool: [],
      grid,
      allActions: starredActionsFromGrid(grid),
      otherActions: [{ id: "o", text: "Book the van" }],
      notes: "",
    });
    const actions = html.slice(html.indexOf(">Actions<"));
    expect(actions).toContain("For highest risks");
    expect(actions).toContain("★ Lock down social media");
    expect(actions).toContain(">Other</p>");
    expect(actions).toContain("• Book the van");
    expect(actions).not.toContain("Doxxing");
  });
});
