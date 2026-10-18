import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { INITIAL_COLLAPSED, INITIAL_CATEGORIZED_REVEAL_HIDDEN } from "./constants";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import type { GridLine } from "./types";
import { useRiskMatrix } from "./useRiskMatrix";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

const sub = (id: string, starred = false) => ({ id, text: id, starred });

function snapshot(): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid["0-2"] = [
    {
      id: "risk-a",
      text: "Risk A",
      reduce: [sub("a1", true), sub("a2"), sub("a3")],
      prepare: [sub("ap1")],
    },
  ];
  grid["0-1"] = [
    {
      id: "risk-b",
      text: "Risk B",
      reduce: [sub("b1")],
      prepare: [sub("bp1", true), sub("bp2")],
    },
  ];
  return {
    pool: [{ id: "p0", text: "" }],
    grid,
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

const ids = (line: GridLine | undefined, key: "reduce" | "prepare") =>
  (line?.[key] || []).map((s) => s.id);

describe("useRiskMatrix moveSubLine", () => {
  it("reorders within a list", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    act(() => {
      result.current.moveSubLine(
        { cellKey: "0-2", parentLineId: "risk-a", subType: "reduce" },
        "a3",
        {
          list: { cellKey: "0-2", parentLineId: "risk-a", subType: "reduce" },
          beforeId: "a2",
        },
      );
    });
    expect(ids(result.current.grid["0-2"][0], "reduce")).toEqual([
      "a1",
      "a3",
      "a2",
    ]);
  });

  it("moves to the other question on the same risk", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    act(() => {
      result.current.moveSubLine(
        { cellKey: "0-2", parentLineId: "risk-a", subType: "reduce" },
        "a2",
        {
          list: { cellKey: "0-2", parentLineId: "risk-a", subType: "prepare" },
          beforeId: null,
        },
      );
    });
    const riskA = result.current.grid["0-2"][0];
    expect(ids(riskA, "reduce")).toEqual(["a1", "a3"]);
    expect(ids(riskA, "prepare")).toEqual(["ap1", "a2"]);
  });

  it("moves a starred line to another risk, keeping its star and the starred block on top", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    act(() => {
      // Even a drop asking for the very end lands inside the starred block.
      result.current.moveSubLine(
        { cellKey: "0-2", parentLineId: "risk-a", subType: "reduce" },
        "a1",
        {
          list: { cellKey: "0-1", parentLineId: "risk-b", subType: "prepare" },
          beforeId: null,
        },
      );
    });
    const riskA = result.current.grid["0-2"][0];
    const riskB = result.current.grid["0-1"][0];
    expect(ids(riskA, "reduce")).toEqual(["a2", "a3"]);
    expect(ids(riskB, "prepare")).toEqual(["bp1", "a1", "bp2"]);
    expect(riskB.prepare?.find((s) => s.id === "a1")?.starred).toBe(true);
  });
});
