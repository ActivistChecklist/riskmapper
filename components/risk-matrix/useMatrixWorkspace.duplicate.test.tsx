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
import { useMatrixWorkspace } from "./useMatrixWorkspace";

/**
 * Duplicate copies the matrix but never its share setting: the copy of a
 * shared matrix must be a local-only row, or edits to the "copy" would
 * sync to everyone who has the original's link.
 */

function withRisk(text: string): RiskMatrixSnapshot {
  return {
    pool: [{ id: "p1", text }],
    grid: emptyGrid(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

const CLOUD: CloudMatrixMeta = {
  recordId: "rec-1",
  keyB64: "k".repeat(43),
  lastHeadSeq: 7,
  yDocStateB64: "ydoc",
};

const SHARED_ID = "shared-row";

function seed(): MatrixWorkspaceV1 {
  return {
    v: 1,
    activeKind: "saved",
    activeSavedId: SHARED_ID,
    defaultSnapshot: null,
    draftTitle: "Untitled",
    saved: [
      {
        id: SHARED_ID,
        title: "Plan",
        updatedAt: "2026-01-01T00:00:00.000Z",
        snapshot: withRisk("Stored risk"),
        cloud: CLOUD,
      },
    ],
  };
}

function makeFakeRepo(
  initial: MatrixWorkspaceV1,
  { full = false } = {},
): MatrixRepository & { saved: MatrixWorkspaceV1[] } {
  const saved: MatrixWorkspaceV1[] = [];
  return {
    saved,
    load: () => JSON.parse(JSON.stringify(initial)) as MatrixWorkspaceV1,
    save: (w) => {
      if (full && w.saved.length > initial.saved.length) return false;
      saved.push(JSON.parse(JSON.stringify(w)));
      return true;
    },
  };
}

/**
 * The returned promise settles inside a state updater, which React runs
 * when `act` flushes, so start the call inside `act` and await it after.
 */
async function duplicate(api: ReturnType<typeof useMatrixWorkspace>) {
  let pending: ReturnType<typeof api.duplicateActiveMatrix> | undefined;
  act(() => {
    pending = api.duplicateActiveMatrix();
  });
  return pending!;
}

describe("duplicateActiveMatrix", () => {
  it("copies a shared matrix as a new local-only row and switches to it", async () => {
    const repo = makeFakeRepo(seed());
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    // The canvas is ahead of the stored row, as it is mid-session.
    result.current.matrixGetterRef.current = () => withRisk("Live risk");

    const out = await duplicate(result.current);

    expect(out).toEqual({ saved: true, title: "Plan (copy)" });
    const ws = result.current.workspace;
    const copy = ws.saved.find((s) => s.title === "Plan (copy)");
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(SHARED_ID);
    expect(copy!.cloud).toBeUndefined();
    expect(copy!.snapshot.pool).toEqual([{ id: "p1", text: "Live risk" }]);
    expect(ws.activeSavedId).toBe(copy!.id);
    expect(result.current.activeSavedMatrix?.cloud).toBeUndefined();

    // The original keeps its share setting, in state and in storage.
    expect(ws.saved.find((s) => s.id === SHARED_ID)?.cloud).toEqual(CLOUD);
    const last = repo.saved[repo.saved.length - 1];
    expect(last.saved.find((s) => s.id === SHARED_ID)?.cloud).toEqual(CLOUD);
    expect(last.saved.find((s) => s.id === copy!.id)?.cloud).toBeUndefined();
  });

  it("numbers a second copy instead of reusing the first one's title", async () => {
    const repo = makeFakeRepo(seed());
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    result.current.matrixGetterRef.current = () => withRisk("Live risk");

    await duplicate(result.current);
    act(() => result.current.openSaved(SHARED_ID));
    const out = await duplicate(result.current);

    expect(out?.title).toBe("Plan (copy 2)");
  });

  it("changes nothing when storage refuses the copy", async () => {
    const repo = makeFakeRepo(seed(), { full: true });
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    result.current.matrixGetterRef.current = () => withRisk("Live risk");

    const out = await duplicate(result.current);

    expect(out?.saved).toBe(false);
    const ws = result.current.workspace;
    expect(ws.saved.map((s) => s.id)).toEqual([SHARED_ID]);
    expect(ws.activeSavedId).toBe(SHARED_ID);
  });

  it("returns null when no canvas is mounted", async () => {
    const repo = makeFakeRepo(seed());
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    const out = await duplicate(result.current);

    expect(out).toBeNull();
    expect(result.current.workspace.saved).toHaveLength(1);
  });
});
