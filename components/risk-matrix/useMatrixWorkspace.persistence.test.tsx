import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_CATEGORIZED_REVEAL_HIDDEN, INITIAL_COLLAPSED } from "./constants";
import { emptyGrid } from "./riskMatrixUtils";
import type {
  CloudMatrixMeta,
  MatrixRepository,
  RiskMatrixSnapshot,
} from "./matrixTypes";
import { normalizeWorkspace } from "./matrixDataLayer";
import { useMatrixWorkspace } from "./useMatrixWorkspace";

/**
 * Regression coverage for the "remote-driven snapshot updates never
 * persisted to localStorage" bug.
 *
 * Symptom: edits made on one device synced to the other in-memory but
 * disappeared from both on the next refresh, sometimes irreversibly.
 *
 * Root cause: applyRemoteSnapshot used a `let captured` variable
 * outside its setWorkspace updater, then called repo.save(captured)
 * AFTER setWorkspace returned. Under React 19 automatic batching the
 * updater runs during the render phase — well after the if-check has
 * already read `captured` as null — so repo.save never fired. The
 * stale on-disk snapshot then drove the bridge to delete recently-
 * synced risks on the next refresh.
 *
 * The fix moves the side effect inside the updater. These tests pin
 * that down for applyRemoteSnapshot, schedulePersist, and flushSave.
 */

function makeFakeRepo(): MatrixRepository & {
  saved: ReturnType<typeof normalizeWorkspace>[];
} {
  const saved: ReturnType<typeof normalizeWorkspace>[] = [];
  return {
    saved,
    load: () => normalizeWorkspace(null),
    save: (w) => {
      saved.push(JSON.parse(JSON.stringify(w)));
    },
  };
}

function emptySnapshot(): RiskMatrixSnapshot {
  return {
    pool: [],
    grid: emptyGrid(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
  };
}

const CLOUD: CloudMatrixMeta = {
  recordId: "rec-1",
  keyB64: "k".repeat(43),
  lastHeadSeq: 7,
  yDocStateB64: "ydoc",
};

describe("useMatrixWorkspace persistence", () => {
  it("applyRemoteSnapshot persists the new snapshot to localStorage (regression)", () => {
    const repo = makeFakeRepo();
    const { result } = renderHook(() => useMatrixWorkspace(repo));

    // Seed a saved row with cloud meta so applyRemoteSnapshot has a target.
    act(() => {
      result.current.adoptSharedMatrix({
        title: "T",
        snapshot: emptySnapshot(),
        cloud: CLOUD,
      });
    });
    const adoptId = result.current.workspace.activeSavedId!;
    const writesBefore = repo.saved.length;

    const remoteSnapshot: RiskMatrixSnapshot = {
      ...emptySnapshot(),
      pool: [{ id: "p1", text: "from remote" }],
    };
    act(() => {
      result.current.applyRemoteSnapshot(adoptId, {
        snapshot: remoteSnapshot,
        title: "T'",
      });
    });

    // Bug was: no new save fired, so localStorage stayed stale.
    expect(repo.saved.length).toBeGreaterThan(writesBefore);
    const last = repo.saved[repo.saved.length - 1];
    const row = last.saved.find((s) => s.id === adoptId)!;
    expect(row.snapshot.pool).toEqual([{ id: "p1", text: "from remote" }]);
    expect(row.title).toBe("T'");
  });

  it("schedulePersist on a cloud-backed matrix does NOT update row.snapshot (multi-tab race fix)", async () => {
    vi.useFakeTimers();
    try {
      const repo = makeFakeRepo();
      const { result } = renderHook(() => useMatrixWorkspace(repo));
      act(() => {
        result.current.adoptSharedMatrix({
          title: "T",
          snapshot: emptySnapshot(),
          cloud: CLOUD,
        });
      });
      const adoptId = result.current.workspace.activeSavedId!;
      const originalPool = result.current.workspace.saved.find(
        (s) => s.id === adoptId,
      )!.snapshot.pool;
      act(() => {
        result.current.onSnapshotChange({
          ...emptySnapshot(),
          pool: [{ id: "p1", text: "local-only edit" }],
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      // The on-disk row.snapshot is unchanged: the local debounced
      // persist path is intentionally a no-op for cloud-backed
      // matrices. Snapshot updates flow through applyCloudSync /
      // applyRemoteSnapshot only.
      const last = repo.saved[repo.saved.length - 1];
      const row = last.saved.find((s) => s.id === adoptId)!;
      expect(row.snapshot.pool).toEqual(originalPool);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushSave on a cloud-backed matrix does NOT update row.snapshot", () => {
    const repo = makeFakeRepo();
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    act(() => {
      result.current.adoptSharedMatrix({
        title: "T",
        snapshot: emptySnapshot(),
        cloud: CLOUD,
      });
    });
    const adoptId = result.current.workspace.activeSavedId!;
    const originalPool = result.current.workspace.saved.find(
      (s) => s.id === adoptId,
    )!.snapshot.pool;
    result.current.matrixGetterRef.current = () => ({
      ...emptySnapshot(),
      pool: [{ id: "p1", text: "via flush" }],
    });
    act(() => {
      result.current.flushSave();
    });
    const last = repo.saved[repo.saved.length - 1];
    const row = last.saved.find((s) => s.id === adoptId)!;
    expect(row.snapshot.pool).toEqual(originalPool);
  });

  it("schedulePersist on the default (local-only) surface DOES update defaultSnapshot", async () => {
    vi.useFakeTimers();
    try {
      const repo = makeFakeRepo();
      const { result } = renderHook(() => useMatrixWorkspace(repo));
      // The hook starts on activeKind=default — perfect for testing
      // the local-only persist path.
      const writesBefore = repo.saved.length;
      act(() => {
        result.current.onSnapshotChange({
          ...emptySnapshot(),
          pool: [{ id: "p1", text: "draft edit" }],
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(repo.saved.length).toBeGreaterThan(writesBefore);
      const last = repo.saved[repo.saved.length - 1];
      expect(last.defaultSnapshot?.pool).toEqual([
        { id: "p1", text: "draft edit" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("applyCloudSync atomically writes cloud meta + snapshot + title", () => {
    const repo = makeFakeRepo();
    const { result } = renderHook(() => useMatrixWorkspace(repo));
    act(() => {
      result.current.adoptSharedMatrix({
        title: "T",
        snapshot: emptySnapshot(),
        cloud: CLOUD,
      });
    });
    const adoptId = result.current.workspace.activeSavedId!;
    const writesBefore = repo.saved.length;
    const newCloud: CloudMatrixMeta = {
      ...CLOUD,
      lastHeadSeq: 99,
      yDocStateB64: "ydoc-v2",
    };
    const newSnapshot: RiskMatrixSnapshot = {
      ...emptySnapshot(),
      pool: [{ id: "p1", text: "from sync" }],
    };
    act(() => {
      result.current.applyCloudSync(adoptId, {
        cloud: newCloud,
        snapshot: newSnapshot,
        title: "T2",
      });
    });
    expect(repo.saved.length).toBeGreaterThan(writesBefore);
    const last = repo.saved[repo.saved.length - 1];
    const row = last.saved.find((s) => s.id === adoptId)!;
    expect(row.cloud).toEqual(newCloud);
    expect(row.snapshot.pool).toEqual([{ id: "p1", text: "from sync" }]);
    expect(row.title).toBe("T2");
  });
});
