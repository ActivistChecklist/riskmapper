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
  /** Current title for the active saved matrix (saved docs only). */
  activeTitle: string;
  setActiveTitle: (title: string) => void;
  recentSorted: StoredMatrix[];
  flushSave: () => void;
  createNewNamed: (name: string) => void;
  openSaved: (id: string) => void;
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
      : "";

  const setActiveTitle = useCallback(
    (title: string) => {
      const id = workspace.activeSavedId;
      if (!id || workspace.activeKind !== "saved") return;
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
  };
}
