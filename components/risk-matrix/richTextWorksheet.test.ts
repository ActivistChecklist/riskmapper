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
  it("lists resources between the matrix and the plan, escaped", () => {
    const grid = sample();
    const html = buildRichWorksheetHtml({
      title: "March",
      pool: [],
      grid,
      resources: [
        { id: "r1", text: "Two trained medics" },
        { id: "r2", text: " " },
        { id: "r3", text: "<b>Van</b> & driver" },
      ],
      allActions: starredActionsFromGrid(grid),
      otherActions: [],
      notes: "",
    });
    const matrixAt = html.indexOf(">Risk matrix<");
    const resourcesAt = html.indexOf(">Resources<");
    const planAt = html.indexOf(">Mitigations &amp; preparations<");
    expect(matrixAt).toBeGreaterThan(-1);
    expect(resourcesAt).toBeGreaterThan(matrixAt);
    expect(planAt).toBeGreaterThan(resourcesAt);
    const section = html.slice(resourcesAt, planAt);
    expect(section).toContain("<li style=\"margin:0 0 0.25em 0;\">Two trained medics</li>");
    expect(section).toContain("&lt;b&gt;Van&lt;/b&gt; &amp; driver");
    expect(section.match(/<li /g)).toHaveLength(2);
  });

  it("says so when no resources are listed, including in older matrices", () => {
    const grid = sample();
    const html = buildRichWorksheetHtml({
      title: "March",
      pool: [],
      grid,
      allActions: [],
      otherActions: [],
      notes: "",
    });
    const section = html.slice(
      html.indexOf(">Resources<"),
      html.indexOf(">Mitigations &amp; preparations<"),
    );
    expect(section).toContain("No resources listed yet.");
  });

  it("lays the plan out per risk with both questions under it", () => {
    const grid = sample();
    const html = buildRichWorksheetHtml({
      title: "March",
      pool: [],
      grid,
      allActions: starredActionsFromGrid(grid),
      otherActions: [],
      notes: "",
    });
    const plan = html.slice(html.indexOf("Mitigations"), html.indexOf(">Actions<"));
    expect(plan).toContain("Highest risk (1)");
    expect(plan).toContain("Doxxing of organizers");
    expect(plan).toContain(MITIGATION_PROMPTS.reduce);
    expect(plan).toContain(MITIGATION_PROMPTS.prepare);
    expect(plan).toContain("★ Lock down social media");
    expect(plan).toContain("• Data broker removal");
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
