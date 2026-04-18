import { describe, expect, it } from "vitest";
import {
  categorizedRiskRowKey,
  emptyGrid,
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
