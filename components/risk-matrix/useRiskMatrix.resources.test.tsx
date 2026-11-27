import { act, renderHook } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { INITIAL_CATEGORIZED_REVEAL_HIDDEN, INITIAL_COLLAPSED } from "./constants";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";
import { useRiskMatrix } from "./useRiskMatrix";

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

function snapshot(): RiskMatrixSnapshot {
  return {
    pool: [],
    grid: emptyGrid(),
    // An id from an older version or an imported file.
    resources: [{ id: "rm-res-r-7", text: "A trained medic" }],
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

describe("resource ids", () => {
  it("differ between two people who loaded the same matrix", () => {
    const a = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    const b = renderHook(() => useRiskMatrix({ initialSnapshot: snapshot() }));
    act(() => a.result.current.addResources(["Van"]));
    act(() => b.result.current.addResources(["Bail fund"]));
    const idA = a.result.current.resources[1].id;
    const idB = b.result.current.resources[1].id;
    expect(idA).not.toBe(idB);
    // Both still count on from the highest id they loaded.
    expect(idA).toMatch(/^rm-res-[a-z0-9]+-r-8$/);
    expect(idB).toMatch(/^rm-res-[a-z0-9]+-r-8$/);
  });
});
