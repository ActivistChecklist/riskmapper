import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetAnalyticsSessionForTests,
  computeFirstTimeFlags,
  createFirstTimeTracker,
  sanitizePath,
  type FirstTimeEvent,
} from "./events";
import type { RiskMatrixSnapshot } from "@/components/risk-matrix/matrixTypes";
import type { CellKey, GridLine, SubLine } from "@/components/risk-matrix/types";

const EMPTY: RiskMatrixSnapshot = {
  pool: [],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
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

function withPool(text: string): RiskMatrixSnapshot {
  return { ...EMPTY, pool: [{ id: "p", text }] };
}

function gridSnap(line: Partial<GridLine>): RiskMatrixSnapshot {
  const grid: Record<CellKey, GridLine[]> = {
    "0-0": [{ id: "g", text: "", ...line }],
  };
  return { ...EMPTY, grid };
}

function withMitigationText(text: string): RiskMatrixSnapshot {
  const sub: SubLine = { id: "s", text, starred: false };
  return gridSnap({ text: "risk", reduce: [sub] });
}

function withMitigationStarred(text = ""): RiskMatrixSnapshot {
  const sub: SubLine = { id: "s", text, starred: true };
  return gridSnap({ text: "risk", reduce: [sub] });
}

afterEach(() => {
  __resetAnalyticsSessionForTests();
});

describe("sanitizePath", () => {
  it("passes through the home path", () => {
    expect(sanitizePath("/")).toBe("/");
  });

  it("passes through non-share paths unchanged", () => {
    expect(sanitizePath("/privacy")).toBe("/privacy");
    expect(sanitizePath("/about/team")).toBe("/about/team");
  });

  it("collapses any /grid/<recordId> to /grid/", () => {
    expect(sanitizePath("/grid/abc123")).toBe("/grid/");
    expect(sanitizePath("/grid/AbCdEf-GhIjK_-LmNoPqRsTuVwXyZ_0_1234")).toBe(
      "/grid/",
    );
  });

  it("collapses /grid and /grid/ themselves", () => {
    expect(sanitizePath("/grid")).toBe("/grid/");
    expect(sanitizePath("/grid/")).toBe("/grid/");
  });

  it("does not match unrelated paths that contain 'grid'", () => {
    expect(sanitizePath("/gridiron")).toBe("/gridiron");
    expect(sanitizePath("/about/grid")).toBe("/about/grid");
  });
});

describe("computeFirstTimeFlags", () => {
  it("returns all false for an empty snapshot", () => {
    expect(computeFirstTimeFlags(EMPTY)).toEqual({
      first_pool_item: false,
      first_grid_item: false,
      first_mitigation_typed: false,
      first_mitigation_starred: false,
      first_notes_content: false,
    });
  });

  it("ignores whitespace-only pool text", () => {
    expect(computeFirstTimeFlags(withPool("   \n\t")).first_pool_item).toBe(
      false,
    );
  });

  it("treats notes with only NBSP as empty", () => {
    const nbspOnly: RiskMatrixSnapshot = {
      ...EMPTY,
      notes: " \n ",
    };
    expect(computeFirstTimeFlags(nbspOnly).first_notes_content).toBe(false);
  });

  it("detects notes once any non-whitespace char appears", () => {
    expect(
      computeFirstTimeFlags({ ...EMPTY, notes: "hi" }).first_notes_content,
    ).toBe(true);
  });

  it("detects a starred mitigation regardless of text content", () => {
    expect(
      computeFirstTimeFlags(withMitigationStarred()).first_mitigation_starred,
    ).toBe(true);
  });

  it("detects a typed mitigation independent of starring", () => {
    const flags = computeFirstTimeFlags(withMitigationText("call lawyer"));
    expect(flags.first_mitigation_typed).toBe(true);
    expect(flags.first_mitigation_starred).toBe(false);
  });
});

describe("createFirstTimeTracker", () => {
  it("does not fire on the seed observation, even when conditions are true", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();
    const t = createFirstTimeTracker(fire);
    t(withPool("already here"));
    expect(fire).not.toHaveBeenCalled();
  });

  it("fires once on a within-canvas false-to-true transition", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();
    const t = createFirstTimeTracker(fire);
    t(EMPTY);
    t(withPool("first risk"));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith("first_pool_item");
  });

  it("does not re-fire after delete-and-re-add within the same canvas", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();
    const t = createFirstTimeTracker(fire);
    t(EMPTY);
    t(withPool("a"));
    t(EMPTY);
    t(withPool("b"));
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("blocks events whose seed flag was already true", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();
    const t = createFirstTimeTracker(fire);
    t(withPool("seeded"));
    t(EMPTY);
    t(withPool("re-added"));
    expect(fire).not.toHaveBeenCalled();
  });

  it("does not double-fire across canvas instances in the same session", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();

    const t1 = createFirstTimeTracker(fire);
    t1(EMPTY);
    t1(withPool("a"));
    expect(fire).toHaveBeenCalledTimes(1);

    const t2 = createFirstTimeTracker(fire);
    t2(EMPTY);
    t2(withPool("b"));
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("re-seeds blocked per canvas, so a populated B doesn't fire on edits", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();

    const t1 = createFirstTimeTracker(fire);
    t1(EMPTY);
    expect(fire).not.toHaveBeenCalled();

    const t2 = createFirstTimeTracker(fire);
    t2(withPool("populated"));
    t2(EMPTY);
    t2(withPool("after delete"));
    expect(fire).not.toHaveBeenCalled();
  });

  it("fires distinct events for distinct keys on the same observation", () => {
    const fire = vi.fn<(k: FirstTimeEvent) => void>();
    const t = createFirstTimeTracker(fire);
    t(EMPTY);
    t({
      ...EMPTY,
      pool: [{ id: "p", text: "risk" }],
      grid: {
        "0-0": [
          { id: "g", text: "g-risk", reduce: [{ id: "s", text: "mit", starred: true }] },
        ],
      },
      notes: "hello",
    });
    const fired = fire.mock.calls.map((c) => c[0]).sort();
    expect(fired).toEqual([
      "first_grid_item",
      "first_mitigation_starred",
      "first_mitigation_typed",
      "first_notes_content",
      "first_pool_item",
    ]);
  });
});
