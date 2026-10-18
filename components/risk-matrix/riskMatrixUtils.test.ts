import { describe, expect, it } from "vitest";
import {
  applyPoolTextUpdate,
  categorizedRiskRowKey,
  emptyGrid,
  getCategorizedRisksFlat,
  isMatrixCellEmptyBackgroundClick,
  isMitigationColumnEmptyBackgroundClick,
  mergeHydratedGrid,
  normalizePoolLines,
  partitionStarred,
  splitInsertIndex,
} from "./riskMatrixUtils";

describe("categorizedRiskRowKey", () => {
  it("joins cell and line id", () => {
    expect(categorizedRiskRowKey("1-2", "abc")).toBe("1-2:abc");
  });
});

describe("normalizePoolLines", () => {
  it("keeps multiple all-empty rows (does not collapse to one)", () => {
    const lines = [
      { id: "a", text: "" },
      { id: "b", text: "" },
      { id: "c", text: "" },
    ];
    expect(normalizePoolLines(lines)).toEqual(lines);
  });

  it("still collapses several trailing empties after the last non-empty line", () => {
    const lines = [
      { id: "a", text: "x" },
      { id: "b", text: "" },
      { id: "c", text: "" },
      { id: "d", text: "" },
    ];
    expect(normalizePoolLines(lines)).toEqual([
      { id: "a", text: "x" },
      { id: "b", text: "" },
    ]);
  });
});

describe("applyPoolTextUpdate", () => {
  it("moves one line to the matrix cell for HI/LL shortcut (single grid append)", () => {
    let n = 0;
    const nid = () => `id-${++n}`;
    const pool = [{ id: "a", text: "" }];
    const r = applyPoolTextUpdate(pool, "a", "my risk HI/LL", nid);
    expect(r.gridAppend).not.toBeNull();
    expect(r.gridAppend?.cell).toBe("2-2");
    expect(r.gridAppend?.line.text).toBe("my risk");
    expect(r.pool.some((l) => l.text === "my risk")).toBe(false);
    expect(r.pool.filter((l) => l.text === "").length).toBeGreaterThanOrEqual(1);
  });
});

describe("getCategorizedRisksFlat", () => {
  it("lists non-empty risks in group/cell/line order", () => {
    const grid = emptyGrid();
    grid["0-2"] = [
      { id: "a", text: "first red cell" },
      { id: "b", text: "second in same cell" },
    ];
    grid["0-1"] = [{ id: "c", text: "orange" }];
    grid["0-0"] = [{ id: "d", text: "" }];
    expect(getCategorizedRisksFlat(grid)).toEqual([
      { cellKey: "0-2", lineId: "a" },
      { cellKey: "0-2", lineId: "b" },
      { cellKey: "0-1", lineId: "c" },
    ]);
  });
});

describe("mergeHydratedGrid", () => {
  it("fills missing cell keys from emptyGrid", () => {
    const merged = mergeHydratedGrid({ "0-0": [] });
    expect(Object.keys(merged)).toEqual(Object.keys(emptyGrid()));
    expect(merged["1-1"]).toEqual([]);
  });

  it("returns emptyGrid when input is undefined", () => {
    expect(mergeHydratedGrid(undefined)).toEqual(emptyGrid());
  });
});

describe("isMatrixCellEmptyBackgroundClick", () => {
  it("returns true for a bare div target", () => {
    const el = document.createElement("div");
    expect(isMatrixCellEmptyBackgroundClick(el)).toBe(true);
  });

  it("returns false when target is inside a line row", () => {
    const row = document.createElement("div");
    row.setAttribute("data-row-id", "x");
    const inner = document.createElement("span");
    row.appendChild(inner);
    expect(isMatrixCellEmptyBackgroundClick(inner)).toBe(false);
  });

  it("returns false for textarea and button targets", () => {
    expect(isMatrixCellEmptyBackgroundClick(document.createElement("textarea"))).toBe(
      false,
    );
    expect(isMatrixCellEmptyBackgroundClick(document.createElement("button"))).toBe(
      false,
    );
  });
});

describe("isMitigationColumnEmptyBackgroundClick", () => {
  it("returns true for a bare div target", () => {
    const el = document.createElement("div");
    expect(isMitigationColumnEmptyBackgroundClick(el)).toBe(true);
  });

  it("returns false when target is inside a mitigation row", () => {
    const row = document.createElement("div");
    row.setAttribute("data-mitigation-row", "");
    const inner = document.createElement("span");
    row.appendChild(inner);
    expect(isMitigationColumnEmptyBackgroundClick(inner)).toBe(false);
  });

  it("returns false for textarea and button targets", () => {
    expect(
      isMitigationColumnEmptyBackgroundClick(document.createElement("textarea")),
    ).toBe(false);
    expect(
      isMitigationColumnEmptyBackgroundClick(document.createElement("button")),
    ).toBe(false);
  });
});

describe("partitionStarred", () => {
  const sub = (id: string, starred: boolean) => ({ id, text: id, starred });

  it("puts starred lines first and keeps relative order in each block", () => {
    const out = partitionStarred([
      sub("a", false),
      sub("b", true),
      sub("c", false),
      sub("d", true),
    ]);
    expect(out.map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("drops a newly starred line at the bottom of the starred block", () => {
    // "c" was just starred; "a" and "b" were already at the top.
    const out = partitionStarred([
      sub("a", true),
      sub("b", true),
      sub("c", true),
      sub("d", false),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts a newly unstarred line just below the starred block", () => {
    // "a" was just unstarred.
    const out = partitionStarred([
      sub("a", false),
      sub("b", true),
      sub("c", false),
    ]);
    expect(out.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});

describe("splitInsertIndex", () => {
  const sub = (id: string, starred: boolean) => ({ id, text: id, starred });
  const list = [sub("a", true), sub("b", true), sub("c", false)];

  it("inserts right below an unstarred line", () => {
    expect(splitInsertIndex(list, 2)).toBe(3);
  });

  it("inserts after the starred block when splitting a starred line", () => {
    expect(splitInsertIndex(list, 0)).toBe(2);
  });
});
