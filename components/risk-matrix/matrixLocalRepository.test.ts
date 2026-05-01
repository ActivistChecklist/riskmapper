import { describe, expect, it } from "vitest";
import { INITIAL_COLLAPSED } from "./constants";
import {
  createLocalMatrixRepository,
  normalizeWorkspace,
} from "./matrixLocalRepository";
import type { MatrixWorkspaceV1, RiskMatrixSnapshot } from "./matrixTypes";
import { DEFAULT_DRAFT_MATRIX_TITLE } from "./matrixTypes";

function minimalSnapshot(): RiskMatrixSnapshot {
  return {
    pool: [{ id: "p1", text: "x" }],
    grid: (() => {
      const g: RiskMatrixSnapshot["grid"] = {};
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          g[`${r}-${c}`] = [];
        }
      }
      return g;
    })(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: {
      red: false,
      orange: false,
      yellow: false,
      green: false,
    },
    notes: "",
  };
}

describe("normalizeWorkspace", () => {
  it("returns a valid empty v1 workspace for garbage input", () => {
    const w = normalizeWorkspace(null);
    expect(w.v).toBe(1);
    expect(w.activeKind).toBe("default");
    expect(w.draftTitle).toBe(DEFAULT_DRAFT_MATRIX_TITLE);
    expect(w.saved).toEqual([]);
  });
});

describe("createLocalMatrixRepository", () => {
  it("round-trips workspace state in localStorage", () => {
    const key = "riskmatrix.workspace.v1";
    const prev = globalThis.localStorage?.getItem(key);
    try {
      localStorage.removeItem(key);
      const repo = createLocalMatrixRepository();
      const snap = minimalSnapshot();
      const doc: MatrixWorkspaceV1 = {
        v: 1,
        activeKind: "default",
        activeSavedId: null,
        defaultSnapshot: snap,
        draftTitle: "Workshop matrix",
        saved: [
          {
            id: "saved-1",
            title: "Test doc",
            updatedAt: new Date().toISOString(),
            snapshot: snap,
          },
        ],
      };
      repo.save(doc);
      const loaded = repo.load();
      expect(loaded.saved).toHaveLength(1);
      expect(loaded.saved[0].title).toBe("Test doc");
      expect(loaded.defaultSnapshot?.pool[0].text).toBe("x");
      expect(loaded.draftTitle).toBe("Workshop matrix");
    } finally {
      if (prev == null) localStorage.removeItem(key);
      else localStorage.setItem(key, prev);
    }
  });
});
