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

function snapshot(): RiskMatrixSnapshot {
  const grid = emptyGrid();
  grid["1-1"] = [
    {
      id: "g1",
      text: "Grid risk",
      reduce: [
        { id: "s1", text: "Starred", starred: true },
        { id: "s2", text: "", starred: false },
      ],
      prepare: [{ id: "s3", text: "", starred: false }],
    },
  ];
  return {
    pool: [
      { id: "p1", text: "Existing" },
      { id: "p2", text: "" },
    ],
    grid,
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [{ id: "o1", text: "" }],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

/** A textarea carrying the data-* id the rows render, with the caret at the end. */
function pasteInto(
  attr: string,
  id: string,
  value: string,
  pasted: string,
  onPaste: (e: React.ClipboardEvent<HTMLElement>) => void,
) {
  const el = document.createElement("textarea");
  el.setAttribute(attr, id);
  el.value = value;
  el.setSelectionRange(value.length, value.length);
  let prevented = false;
  act(() => {
    onPaste({
      target: el,
      clipboardData: { getData: () => pasted },
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as React.ClipboardEvent<HTMLElement>);
  });
  return { prevented };
}

describe("useRiskMatrix multi-line paste", () => {
  it("splits a paste in the pool into entries and keeps a trailing empty line", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    const { prevented } = pasteInto("data-line-id", "p2", "", "One\nTwo\nThree", result.current.handlePaste);
    expect(prevented).toBe(true);
    expect(result.current.pool.map((l) => l.text)).toEqual([
      "Existing",
      "One",
      "Two",
      "Three",
      "",
    ]);
  });

  it("splits a paste in a matrix cell", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    pasteInto("data-line-id", "g1", "Grid risk", " one\nSecond\nThird", result.current.handlePaste);
    const lines = result.current.grid["1-1"];
    expect(lines.map((l) => l.text)).toEqual(["Grid risk one", "Second", "Third"]);
    // The original keeps its mitigations.
    expect(lines[0].reduce?.[0].text).toBe("Starred");
  });

  it("splits a paste in the categorized risk list", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    pasteInto("data-risk-line-id", "g1", "Grid risk", " A\nB", result.current.handlePaste);
    expect(result.current.grid["1-1"].map((l) => l.text)).toEqual(["Grid risk A", "B"]);
  });

  it("splits a paste in a mitigation, keeping the star on new entries", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    pasteInto("data-sub-line-id", "s1", "Starred", " one\nNext\nLast", result.current.handlePaste);
    const reduce = result.current.grid["1-1"][0].reduce ?? [];
    expect(reduce.map((s) => [s.text, s.starred])).toEqual([
      ["Starred one", true],
      ["Next", true],
      ["Last", true],
      ["", false],
    ]);
  });

  it("splits a paste in other actions", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    pasteInto("data-line-id", "o1", "", "Call lawyer\nBack up phone", result.current.handlePaste);
    expect(result.current.otherActions.map((o) => o.text)).toEqual([
      "Call lawyer",
      "Back up phone",
    ]);
  });

  it("leaves a single-line paste to the browser", () => {
    const { result } = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    const { prevented } = pasteInto("data-line-id", "p2", "", "Just one", result.current.handlePaste);
    expect(prevented).toBe(false);
    expect(result.current.pool.map((l) => l.text)).toEqual(["Existing", ""]);
  });
});
