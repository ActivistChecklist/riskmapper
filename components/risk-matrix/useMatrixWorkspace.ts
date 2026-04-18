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

export type MatrixWorkspaceApi = {
  workspace: MatrixWorkspaceV1;
  initialSnapshot: RiskMatrixSnapshot | undefined;
  surfaceId: string;
  /** False only on the first paint before `localStorage` is applied — avoids UI flashes. */
  workspaceReady: boolean;
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
};

const EMPTY_WORKSPACE = normalizeLoadedWorkspace(normalizeWorkspace(null));

export function useMatrixWorkspace(
  repo: MatrixRepository = createLocalMatrixRepository(),
): MatrixWorkspaceApi {
  const [workspace, setWorkspace] =
    useState<MatrixWorkspaceV1>(EMPTY_WORKSPACE);
  const [surfaceId, setSurfaceId] = useState("pre-hydrate");

  useLayoutEffect(() => {
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
    setWorkspace((w) => {
      const next = mergeSnapshotIntoWorkspace(
        w,
        snap,
        identityRef.current,
      );
      repo.save(next);
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
        setWorkspace((w) => {
          const next = mergeSnapshotIntoWorkspace(
            w,
            snap,
            identityRef.current,
          );
          repo.save(next);
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
      setWorkspace((w) => {
        const next: MatrixWorkspaceV1 = {
          ...w,
          saved: w.saved.map((s) =>
            s.id === id ? { ...s, title } : s,
          ),
        };
        repo.save(next);
        return next;
      });
    },
    [repo, workspace.activeKind, workspace.activeSavedId],
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
    workspaceReady: surfaceId !== "pre-hydrate",
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
  };
}
