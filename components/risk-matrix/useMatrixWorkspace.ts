"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  createLocalMatrixRepository,
  normalizeWorkspace,
} from "./matrixDataLayer";
import type {
  CloudMatrixMeta,
  MatrixRepository,
  MatrixWorkspaceV1,
  RiskMatrixSnapshot,
  StoredMatrix,
} from "./matrixTypes";
import { DEFAULT_DRAFT_MATRIX_TITLE } from "./matrixTypes";

function mergeSnapshotIntoWorkspace(
  w: MatrixWorkspaceV1,
  snap: RiskMatrixSnapshot,
  active: { kind: "default" | "saved"; id: string | null },
): MatrixWorkspaceV1 {
  if (active.kind === "default") {
    return { ...w, defaultSnapshot: snap };
  }
  if (!active.id) return w;
  const now = new Date().toISOString();
  return {
    ...w,
    saved: w.saved.map((s) =>
      s.id === active.id ? { ...s, snapshot: snap, updatedAt: now } : s,
    ),
  };
}

function normalizeLoadedWorkspace(w: MatrixWorkspaceV1): MatrixWorkspaceV1 {
  if (w.activeKind === "saved" && w.activeSavedId) {
    const ok = w.saved.some((s) => s.id === w.activeSavedId);
    if (!ok) {
      return { ...w, activeKind: "default", activeSavedId: null };
    }
  }
  return w;
}

/**
 * STAGE 1 placeholder — the live-sync wiring (forwarding local snapshot
 * changes into a per-record Y.Doc and shipping updates to the server) is
 * the next piece of work. Kept as a no-op type so callers that pass an
 * `onCloudWrite` survive the type check without changes.
 */
export type CloudWriteHook = (args: {
  cloud: CloudMatrixMeta;
  snapshot: RiskMatrixSnapshot;
  title: string;
}) => void;

export type MatrixWorkspaceApi = {
  workspace: MatrixWorkspaceV1;
  initialSnapshot: RiskMatrixSnapshot | undefined;
  surfaceId: string;
  matrixGetterRef: MutableRefObject<(() => RiskMatrixSnapshot) | null>;
  onSnapshotChange: (snap: RiskMatrixSnapshot) => void;
  /** Current matrix title (saved row title, or draft title when on the default surface). */
  activeTitle: string;
  setActiveTitle: (title: string) => void;
  recentSorted: StoredMatrix[];
  flushSave: () => void;
  createNewNamed: (name: string) => void;
  openSaved: (id: string) => void;
  /** Remove a saved matrix from the library (no-op if id is missing). */
  removeSavedMatrix: (id: string) => void;
  /** Delete the active matrix: remove it if saved, or clear the draft from this device. */
  deleteActiveMatrix: () => void;
  /** Attach or update cloud-sync metadata on a saved matrix. */
  setCloudMeta: (id: string, cloud: CloudMatrixMeta | null) => void;
  /** Overwrite a saved row's snapshot + title from a remote source. */
  applyRemoteSnapshot: (
    id: string,
    args: { snapshot: RiskMatrixSnapshot; title: string },
  ) => void;
  /** Lookup helper. */
  findSaved: (id: string) => StoredMatrix | undefined;
  /** The matrix object currently open on the canvas, if it's a saved row. */
  activeSavedMatrix: StoredMatrix | null;
  /**
   * Adopt an inbound shared matrix as a new saved row and switch to it.
   * Returns the new id. Used by the share-link import flow.
   */
  adoptSharedMatrix: (args: {
    title: string;
    snapshot: RiskMatrixSnapshot;
    cloud: CloudMatrixMeta;
  }) => string;
  /**
   * Promote the current draft (default surface) to a saved row using `name`,
   * keep its current snapshot, and switch active to the new row. Used when
   * the user clicks Share on an unsaved draft. Returns the new id, or
   * `null` if there is no draft to promote (already on a saved row).
   */
  promoteDraftToSaved: (name: string) => string | null;
};

const EMPTY_WORKSPACE = normalizeLoadedWorkspace(normalizeWorkspace(null));

export function useMatrixWorkspace(
  repo: MatrixRepository = createLocalMatrixRepository(),
  options?: { onCloudWrite?: CloudWriteHook },
): MatrixWorkspaceApi {
  const [workspace, setWorkspace] =
    useState<MatrixWorkspaceV1>(EMPTY_WORKSPACE);
  const [surfaceId, setSurfaceId] = useState("pre-hydrate");

  useLayoutEffect(() => {
    // SSR-safe localStorage hydration: the static-export build renders the
    // EMPTY_WORKSPACE; we swap in the persisted state before paint. This is
    // the intended pattern for client-only stores in Next.js App Router.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(normalizeLoadedWorkspace(repo.load()));
    setSurfaceId(crypto.randomUUID());
  }, [repo]);

  const identityRef = useRef({
    kind: workspace.activeKind,
    id: workspace.activeSavedId,
  });
  useEffect(() => {
    identityRef.current = {
      kind: workspace.activeKind,
      id: workspace.activeSavedId,
    };
  }, [workspace.activeKind, workspace.activeSavedId]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matrixGetterRef = useRef<(() => RiskMatrixSnapshot) | null>(null);
  const onCloudWriteRef = useRef<CloudWriteHook | undefined>(options?.onCloudWrite);
  useEffect(() => {
    onCloudWriteRef.current = options?.onCloudWrite;
  }, [options?.onCloudWrite]);

  function maybePushCloud(next: MatrixWorkspaceV1): void {
    const hook = onCloudWriteRef.current;
    if (!hook) return;
    if (next.activeKind !== "saved" || !next.activeSavedId) return;
    const row = next.saved.find((s) => s.id === next.activeSavedId);
    if (!row || !row.cloud) return;
    hook({ cloud: row.cloud, snapshot: row.snapshot, title: row.title });
  }

  const cancelPendingPersist = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const flushSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const snap = matrixGetterRef.current?.();
    if (!snap) return;
    // Side-effects MUST live INSIDE the updater. Reading `captured`
    // outside the updater is unreliable under React 19's automatic
    // batching: in async dispatch contexts (setTimeout, Promise,
    // SSE handlers) the updater runs during the render phase, AFTER
    // the synchronous code following setState has already returned.
    // `captured` would still be null when an outer `repo.save` reads
    // it, so localStorage would silently never be written.
    // repo.save is idempotent (same workspace → same bytes), so a
    // potential StrictMode double-invocation is fine.
    setWorkspace((w) => {
      const next = mergeSnapshotIntoWorkspace(w, snap, identityRef.current);
      repo.save(next);
      maybePushCloud(next);
      return next;
    });
  }, [repo]);

  const schedulePersist = useCallback(
    (snap: RiskMatrixSnapshot) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        // Side-effects live INSIDE the updater — see flushSave for why.
        setWorkspace((w) => {
          const next = mergeSnapshotIntoWorkspace(w, snap, identityRef.current);
          repo.save(next);
          maybePushCloud(next);
          return next;
        });
      }, 400);
    },
    [repo],
  );

  const onSnapshotChange = useCallback(
    (snap: RiskMatrixSnapshot) => {
      schedulePersist(snap);
    },
    [schedulePersist],
  );

  const initialSnapshot = useMemo((): RiskMatrixSnapshot | undefined => {
    if (workspace.activeKind === "saved" && workspace.activeSavedId) {
      const row = workspace.saved.find((s) => s.id === workspace.activeSavedId);
      return row?.snapshot;
    }
    return workspace.defaultSnapshot ?? undefined;
  }, [
    workspace.activeKind,
    workspace.activeSavedId,
    workspace.defaultSnapshot,
    workspace.saved,
  ]);

  const activeTitle =
    workspace.activeKind === "saved" && workspace.activeSavedId
      ? (workspace.saved.find((s) => s.id === workspace.activeSavedId)?.title ??
        "")
      : workspace.draftTitle;

  const setActiveTitle = useCallback(
    (title: string) => {
      if (workspace.activeKind === "default") {
        setWorkspace((w) => {
          const next: MatrixWorkspaceV1 = { ...w, draftTitle: title };
          repo.save(next);
          return next;
        });
        return;
      }
      const id = workspace.activeSavedId;
      if (!id) return;
      let captured: MatrixWorkspaceV1 | null = null;
      setWorkspace((w) => {
        const next: MatrixWorkspaceV1 = {
          ...w,
          saved: w.saved.map((s) =>
            s.id === id ? { ...s, title } : s,
          ),
        };
        captured = next;
        return next;
      });
      if (captured) {
        repo.save(captured);
        maybePushCloud(captured);
      }
    },
    [repo, workspace.activeKind, workspace.activeSavedId],
  );

  const setCloudMeta = useCallback(
    (id: string, cloud: CloudMatrixMeta | null) => {
      setWorkspace((w) => {
        if (!w.saved.some((s) => s.id === id)) return w;
        const next: MatrixWorkspaceV1 = {
          ...w,
          saved: w.saved.map((s) => {
            if (s.id !== id) return s;
            if (cloud === null) {
              const nextRow: StoredMatrix = { ...s };
              delete nextRow.cloud;
              return nextRow;
            }
            return { ...s, cloud };
          }),
        };
        repo.save(next);
        return next;
      });
    },
    [repo],
  );

  /**
   * Replace a saved row's snapshot + title from a remote source (a Y.Doc
   * update arriving via SSE). Bypasses the local debounced-persist path
   * since the new state is already authoritative.
   */
  const applyRemoteSnapshot = useCallback(
    (id: string, args: { snapshot: RiskMatrixSnapshot; title: string }) => {
      const now = new Date().toISOString();
      setWorkspace((w) => {
        if (!w.saved.some((s) => s.id === id)) return w;
        const next: MatrixWorkspaceV1 = {
          ...w,
          saved: w.saved.map((s) =>
            s.id === id
              ? { ...s, snapshot: args.snapshot, title: args.title, updatedAt: now }
              : s,
          ),
        };
        // repo.save MUST run inside the updater. This callback fires
        // from useCloudMatrix's SSE onUpdate handler — an async
        // context where React 19's automatic batching delays the
        // updater. A captured-outside pattern would observe `null`
        // and silently skip the localStorage write, leaving
        // row.snapshot stale on disk. On the next refresh, the
        // bridge would seed `lastBridgedRef` from the doc (fresh)
        // and diff against useRiskMatrix's stale state — emitting
        // REMOVE ops for every risk that was synced after the last
        // local schedulePersist debounce. That's the "edits delete
        // everywhere on refresh" bug.
        repo.save(next);
        return next;
      });
    },
    [repo],
  );

  const findSaved = useCallback(
    (id: string) => workspace.saved.find((s) => s.id === id),
    [workspace.saved],
  );

  const activeSavedMatrix = useMemo<StoredMatrix | null>(() => {
    if (workspace.activeKind !== "saved" || !workspace.activeSavedId) return null;
    return workspace.saved.find((s) => s.id === workspace.activeSavedId) ?? null;
  }, [workspace.activeKind, workspace.activeSavedId, workspace.saved]);

  const adoptSharedMatrix = useCallback(
    (args: { title: string; snapshot: RiskMatrixSnapshot; cloud: CloudMatrixMeta }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const trimmed = args.title.trim() || DEFAULT_DRAFT_MATRIX_TITLE;
      setWorkspace((w) => {
        const next: MatrixWorkspaceV1 = {
          ...w,
          activeKind: "saved",
          activeSavedId: id,
          saved: [
            ...w.saved,
            {
              id,
              title: trimmed,
              updatedAt: now,
              snapshot: args.snapshot,
              cloud: args.cloud,
            },
          ],
        };
        repo.save(next);
        return next;
      });
      setSurfaceId(crypto.randomUUID());
      return id;
    },
    [repo],
  );

  const promoteDraftToSaved = useCallback(
    (name: string): string | null => {
      // Only valid from the default/draft surface — saved rows have nothing
      // to promote. We DON'T re-render the canvas (no setSurfaceId) because
      // the snapshot the user is editing is the one we're keeping; the
      // surface stays mounted, just bound to a saved id now.
      if (identityRef.current.kind !== "default") return null;
      const snap = matrixGetterRef.current?.();
      if (!snap) return null;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const trimmed = name.trim() || DEFAULT_DRAFT_MATRIX_TITLE;
      // Update identityRef synchronously so callers (e.g. setCloudMeta)
      // running in the same tick see the new identity.
      identityRef.current = { kind: "saved", id };
      setWorkspace((w) => {
        const next: MatrixWorkspaceV1 = {
          ...w,
          activeKind: "saved",
          activeSavedId: id,
          defaultSnapshot: null,
          draftTitle: DEFAULT_DRAFT_MATRIX_TITLE,
          saved: [
            ...w.saved,
            { id, title: trimmed, updatedAt: now, snapshot: snap },
          ],
        };
        repo.save(next);
        return next;
      });
      return id;
    },
    [repo],
  );

  const recentSorted = useMemo(() => {
    return [...workspace.saved].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  }, [workspace.saved]);

  const createNewNamed = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      flushSave();
      const snap = matrixGetterRef.current?.();
      if (!snap) return;
      setWorkspace((w) => {
        const now = new Date().toISOString();
        let next = w;
        if (next.activeKind === "default") {
          const id = crypto.randomUUID();
          next = {
            ...next,
            saved: [
              ...next.saved,
              { id, title: trimmed, updatedAt: now, snapshot: snap },
            ],
          };
        } else if (next.activeSavedId) {
          next = {
            ...next,
            saved: next.saved.map((s) =>
              s.id === next.activeSavedId
                ? {
                    ...s,
                    title: trimmed,
                    snapshot: snap,
                    updatedAt: now,
                  }
                : s,
            ),
          };
        }
        next = {
          ...next,
          activeKind: "default",
          activeSavedId: null,
          defaultSnapshot: null,
          draftTitle: DEFAULT_DRAFT_MATRIX_TITLE,
        };
        repo.save(next);
        return next;
      });
      setSurfaceId(crypto.randomUUID());
    },
    [flushSave, repo],
  );

  const openSaved = useCallback(
    (id: string) => {
      flushSave();
      setWorkspace((w) => {
        const exists = w.saved.some((s) => s.id === id);
        if (!exists) return w;
        const next: MatrixWorkspaceV1 = {
          ...w,
          activeKind: "saved",
          activeSavedId: id,
        };
        repo.save(next);
        return next;
      });
      setSurfaceId(crypto.randomUUID());
    },
    [flushSave, repo],
  );

  const removeSavedMatrix = useCallback(
    (id: string) => {
      const deletingActive =
        identityRef.current.kind === "saved" &&
        identityRef.current.id === id;
      if (deletingActive) {
        cancelPendingPersist();
      } else {
        flushSave();
      }
      setWorkspace((w) => {
        if (!w.saved.some((s) => s.id === id)) return w;
        const remaining = w.saved.filter((s) => s.id !== id);
        let next: MatrixWorkspaceV1 = { ...w, saved: remaining };
        if (w.activeKind === "saved" && w.activeSavedId === id) {
          next = {
            ...next,
            activeKind: "default",
            activeSavedId: null,
            defaultSnapshot: null,
            draftTitle: DEFAULT_DRAFT_MATRIX_TITLE,
          };
        }
        repo.save(next);
        return next;
      });
      if (deletingActive) {
        setSurfaceId(crypto.randomUUID());
      }
    },
    [cancelPendingPersist, flushSave, repo],
  );

  const deleteActiveMatrix = useCallback(() => {
    cancelPendingPersist();
    setWorkspace((w) => {
      if (w.activeKind === "saved" && w.activeSavedId) {
        const id = w.activeSavedId;
        const remaining = w.saved.filter((s) => s.id !== id);
        const next: MatrixWorkspaceV1 = {
          ...w,
          saved: remaining,
          activeKind: "default",
          activeSavedId: null,
          defaultSnapshot: null,
          draftTitle: DEFAULT_DRAFT_MATRIX_TITLE,
        };
        repo.save(next);
        return next;
      }
      const next: MatrixWorkspaceV1 = {
        ...w,
        defaultSnapshot: null,
        draftTitle: DEFAULT_DRAFT_MATRIX_TITLE,
      };
      repo.save(next);
      return next;
    });
    setSurfaceId(crypto.randomUUID());
  }, [cancelPendingPersist, repo]);

  return {
    workspace,
    initialSnapshot,
    surfaceId,
    matrixGetterRef,
    onSnapshotChange,
    activeTitle,
    setActiveTitle,
    recentSorted,
    flushSave,
    createNewNamed,
    openSaved,
    removeSavedMatrix,
    deleteActiveMatrix,
    setCloudMeta,
    applyRemoteSnapshot,
    findSaved,
    activeSavedMatrix,
    adoptSharedMatrix,
    promoteDraftToSaved,
  };
}
