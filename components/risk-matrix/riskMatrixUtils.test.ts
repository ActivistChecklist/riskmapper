import { describe, expect, it } from "vitest";
import {
  categorizedRiskRowKey,
  emptyGrid,
  isMatrixCellEmptyBackgroundClick,
  isMitigationColumnEmptyBackgroundClick,
  mergeHydratedGrid,
} from "./riskMatrixUtils";

describe("categorizedRiskRowKey", () => {
  it("joins cell and line id", () => {
    expect(categorizedRiskRowKey("1-2", "abc")).toBe("1-2:abc");
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
