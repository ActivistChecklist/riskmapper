import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { INITIAL_COLLAPSED, INITIAL_CATEGORIZED_REVEAL_HIDDEN } from "./constants";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import { useRiskMatrix } from "./useRiskMatrix";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

function snapshotOneLineInCell(cellKey: string): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid[cellKey] = [{ id: "line-a", text: "Risk A" }];
  return {
    pool: [{ id: "p0", text: "" }],
    grid,
    collapsed: { ...INITIAL_COLLAPSED },
    hasCompletedFirstDragToMatrix: true,
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
  };
}

describe("useRiskMatrix matrix cell background click", () => {
  it("adds a new empty line when the click target is empty cell chrome (not a line or control)", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshotOneLineInCell("0-2") }),
    );
    expect(result.current.grid["0-2"]).toHaveLength(1);

    const padding = document.createElement("div");
    act(() => {
      result.current.onCellClick(
        { target: padding } as unknown as React.MouseEvent<HTMLDivElement>,
        "0-2",
      );
    });

    expect(result.current.grid["0-2"]).toHaveLength(2);
    expect(result.current.grid["0-2"][1].text).toBe("");
  });

  it("does not add a line when the click target is inside a line row", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshotOneLineInCell("0-2") }),
    );
    const row = document.createElement("div");
    row.setAttribute("data-row-id", "line-a");
    const inner = document.createElement("span");
    row.appendChild(inner);

    act(() => {
      result.current.onCellClick(
        { target: inner } as unknown as React.MouseEvent<HTMLDivElement>,
        "0-2",
      );
    });

    expect(result.current.grid["0-2"]).toHaveLength(1);
  });
});
