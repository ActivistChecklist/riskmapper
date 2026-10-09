import type * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { INITIAL_COLLAPSED, INITIAL_CATEGORIZED_REVEAL_HIDDEN } from "./constants";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import type { GridLine, PoolLine } from "./types";
import { useRiskMatrix } from "./useRiskMatrix";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const ROW_HEIGHT = 40;

function snapshot(): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid["0-0"] = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ];
  return {
    pool: [
      { id: "p1", text: "P1" },
      { id: "p2", text: "P2" },
      { id: "p-empty", text: "" },
    ],
    grid,
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

/**
 * Lays out a drop target the way the real components do: a
 * `[data-drop-target]` container holding one `[data-row-id]` per line,
 * stacked {@link ROW_HEIGHT}px apart from y=0. jsdom has no layout, so
 * the rects are stubbed and `elementFromPoint` always returns this
 * container.
 */
function mountDropTarget(loc: string, lines: (PoolLine | GridLine)[]) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  container.setAttribute("data-drop-target", loc);
  lines.forEach((line, i) => {
    const row = document.createElement("div");
    row.setAttribute("data-row-id", line.id);
    row.getBoundingClientRect = () =>
      ({ top: i * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, width: 200 }) as DOMRect;
    container.appendChild(row);
  });
  document.body.appendChild(container);
  document.elementFromPoint = () => container;
}

function pointer(type: string, y: number) {
  window.dispatchEvent(new MouseEvent(type, { clientX: 10, clientY: y }));
}

function startDrag(
  result: { current: ReturnType<typeof useRiskMatrix> },
  id: string,
) {
  act(() => {
    result.current.onGripPointerDown(
      {
        pointerType: "mouse",
        button: 0,
        clientX: 10,
        clientY: 0,
        preventDefault: () => {},
      } as unknown as React.PointerEvent,
      id,
    );
  });
}

describe("useRiskMatrix positioned drag and drop", () => {
  it("reorders within a cell to the gap under the pointer", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    mountDropTarget("0-0", result.current.grid["0-0"]);

    startDrag(result, "c");
    // Upper half of "a": land ahead of it.
    act(() => pointer("pointermove", 10));
    expect(result.current.dropIndicator).toEqual({
      loc: "0-0",
      rowId: "a",
      edge: "before",
    });
    act(() => pointer("pointerup", 10));

    expect(result.current.grid["0-0"].map((l) => l.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(result.current.dropIndicator).toBeNull();
  });

  it("shows no insertion line when hovering the dragged row's own slot", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    mountDropTarget("0-0", result.current.grid["0-0"]);

    startDrag(result, "b");
    act(() => pointer("pointermove", ROW_HEIGHT + 5));
    expect(result.current.dragOverTarget).toBe("0-0");
    expect(result.current.dropIndicator).toBeNull();
    act(() => pointer("pointerup", ROW_HEIGHT + 5));

    expect(result.current.grid["0-0"].map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops a pool risk between two cell risks", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    mountDropTarget("0-0", result.current.grid["0-0"]);

    startDrag(result, "p1");
    // Lower half of "a": land between "a" and "b".
    act(() => pointer("pointermove", 30));
    expect(result.current.dropIndicator).toEqual({
      loc: "0-0",
      rowId: "b",
      edge: "before",
    });
    act(() => pointer("pointerup", 30));

    expect(result.current.grid["0-0"].map((l) => l.id)).toEqual([
      "a",
      "p1",
      "b",
      "c",
    ]);
    expect(result.current.pool.map((l) => l.id)).toEqual(["p2", "p-empty"]);
  });

  it("drops a cell risk into the pool ahead of the trailing empty row", () => {
    const { result } = renderHook(() =>
      useRiskMatrix({ initialSnapshot: snapshot() }),
    );
    mountDropTarget("pool", result.current.pool);

    startDrag(result, "a");
    act(() => pointer("pointerup", 500));

    expect(result.current.pool.map((l) => l.id)).toEqual([
      "p1",
      "p2",
      "a",
      "p-empty",
    ]);
  });
});
