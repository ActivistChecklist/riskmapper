import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INITIAL_CATEGORIZED_REVEAL_HIDDEN, INITIAL_COLLAPSED } from "./constants";
import { emptyGrid } from "./riskMatrixUtils";
import type {
  CloudMatrixMeta,
  MatrixRepository,
  MatrixWorkspaceV1,
  RiskMatrixSnapshot,
} from "./matrixTypes";
import { DEFAULT_DRAFT_MATRIX_TITLE } from "./matrixTypes";
import { useMatrixWorkspace } from "./useMatrixWorkspace";

/**
 * Regression coverage for "switching away from the draft strands it".
 *
 * Nothing in the UI switches back to the draft (default) surface: Open
 * recent lists only saved rows, and every path that returns to the draft
 * surface starts a fresh one. So opening a saved matrix or adopting a
 * share link while the draft has content must keep that draft as its own
 * saved row, or the next New or Delete silently wipes it.
 */

function emptySnapshot(): RiskMatrixSnapshot {
  return {
    pool: [],
    grid: emptyGrid(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

function withRisk(text: string): RiskMatrixSnapshot {
  return { ...emptySnapshot(), pool: [{ id: "p1", text }] };
}

const OTHER_ID = "other-row";

function seed(defaultSnapshot: RiskMatrixSnapshot | null): MatrixWorkspaceV1 {
  return {
    v: 1,
    activeKind: "default",
    activeSavedId: null,
    defaultSnapshot,
    draftTitle: "My draft",
    saved: [
      {
        id: OTHER_ID,
        title: "Other",
        updatedAt: "2026-01-01T00:00:00.000Z",
        snapshot: withRisk("Other risk"),
      },
    ],
  };
}

function makeFakeRepo(initial: MatrixWorkspaceV1): MatrixRepository & {
  saved: MatrixWorkspaceV1[];
} {
  const saved: MatrixWorkspaceV1[] = [];
  return {
    saved,
    load: () => JSON.parse(JSON.stringify(initial)) as MatrixWorkspaceV1,
    save: (w) => {
      saved.push(JSON.parse(JSON.stringify(w)));
    },
  };
}

const CLOUD: CloudMatrixMeta = {
  recordId: "rec-1",
  keyB64: "k".repeat(43),
  lastHeadSeq: 7,
  yDocStateB64: "ydoc",
};

type Switch = {
  name: string;
  run: (api: ReturnType<typeof useMatrixWorkspace>) => void;
};

const SWITCHES: Switch[] = [
  { name: "openSaved", run: (api) => api.openSaved(OTHER_ID) },
  {
    name: "adoptSharedMatrix",
    run: (api) => {
      api.adoptSharedMatrix({
        title: "Shared",
        snapshot: withRisk("Shared risk"),
        cloud: CLOUD,
      });
    },
  },
];

describe.each(SWITCHES)("$name from the draft surface", ({ run }) => {
  it("keeps a draft with content as its own saved row", () => {
    const repo = makeFakeRepo(seed(withRisk("Infiltrator")));
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    act(() => run(result.current));

    const ws = result.current.workspace;
    expect(ws.activeKind).toBe("saved");
    expect(ws.defaultSnapshot).toBeNull();
    expect(ws.draftTitle).toBe(DEFAULT_DRAFT_MATRIX_TITLE);
    const kept = ws.saved.find((s) => s.title === "My draft");
    expect(kept?.snapshot.pool).toEqual([{ id: "p1", text: "Infiltrator" }]);
    expect(ws.activeSavedId).not.toBe(kept?.id);
    // And it reached storage, not just React state.
    const last = repo.saved[repo.saved.length - 1];
    expect(last.saved.map((s) => s.title)).toContain("My draft");
  });

  it("keeps the canvas's latest edits, not just the last debounced persist", () => {
    const repo = makeFakeRepo(seed(null));
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    // The user typed, but the 400ms persist has not fired yet.
    result.current.matrixGetterRef.current = () => withRisk("Typed just now");

    act(() => run(result.current));

    const kept = result.current.workspace.saved.find(
      (s) => s.title === "My draft",
    );
    expect(kept?.snapshot.pool).toEqual([{ id: "p1", text: "Typed just now" }]);
  });

  it("does not save an empty draft", () => {
    const blank: RiskMatrixSnapshot = {
      ...emptySnapshot(),
      // Blank lines and an NBSP-only note (how NotesEditor stores an
      // empty paragraph) are not content.
      pool: [{ id: "p1", text: "  " }],
      notes: " \n",
    };
    const repo = makeFakeRepo(seed(blank));
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    act(() => run(result.current));

    const titles = result.current.workspace.saved.map((s) => s.title);
    expect(titles).not.toContain("My draft");
  });
});

describe("switching between saved matrices", () => {
  it("openSaved from a saved row adds no rows", () => {
    const start = seed(withRisk("Infiltrator"));
    const repo = makeFakeRepo({
      ...start,
      activeKind: "saved",
      activeSavedId: OTHER_ID,
      saved: [
        ...start.saved,
        {
          id: "second",
          title: "Second",
          updatedAt: "2026-01-02T00:00:00.000Z",
          snapshot: withRisk("Second risk"),
        },
      ],
    });
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    act(() => result.current.openSaved("second"));

    const ws = result.current.workspace;
    expect(ws.activeSavedId).toBe("second");
    expect(ws.saved.map((s) => s.title).sort()).toEqual(["Other", "Second"]);
  });

  it("openSaved with an unknown id leaves the draft where it is", () => {
    const repo = makeFakeRepo(seed(withRisk("Infiltrator")));
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    act(() => result.current.openSaved("missing"));

    const ws = result.current.workspace;
    expect(ws.activeKind).toBe("default");
    expect(ws.defaultSnapshot?.pool).toEqual([{ id: "p1", text: "Infiltrator" }]);
    expect(ws.saved.map((s) => s.title)).toEqual(["Other"]);
  });
});
