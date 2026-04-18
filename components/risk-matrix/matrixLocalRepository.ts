import type {
  MatrixRepository,
  MatrixWorkspaceV1,
  RiskMatrixSnapshot,
} from "./matrixTypes";
import { COLOR_GROUPS } from "./constants";
import type { CategorizedRevealHiddenState, OtherAction } from "./types";

const STORAGE_KEY = "riskmatrix.workspace.v1";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isOtherAction(x: unknown): x is OtherAction {
  if (!isRecord(x)) return false;
  return typeof x.id === "string" && typeof x.text === "string";
}

function isCategorizedRevealHidden(
  x: unknown,
): x is CategorizedRevealHiddenState {
  if (!isRecord(x)) return false;
  for (const g of COLOR_GROUPS) {
    const v = x[g.key];
    if (v !== undefined && typeof v !== "boolean") return false;
  }
  return true;
}

function isRiskMatrixSnapshot(x: unknown): x is RiskMatrixSnapshot {
  if (!isRecord(x)) return false;
  if (!Array.isArray(x.pool)) return false;
  if (!isRecord(x.grid)) return false;
  if (!isRecord(x.collapsed)) return false;
  if (typeof x.hasCompletedFirstDragToMatrix !== "boolean") return false;
  if (x.otherActions !== undefined) {
    if (!Array.isArray(x.otherActions) || !x.otherActions.every(isOtherAction)) {
      return false;
    }
  }
  if (x.hiddenCategorizedRiskKeys !== undefined) {
    if (
      !Array.isArray(x.hiddenCategorizedRiskKeys) ||
      !x.hiddenCategorizedRiskKeys.every((k) => typeof k === "string")
    ) {
      return false;
    }
  }
  if (x.categorizedRevealHidden !== undefined) {
    if (!isCategorizedRevealHidden(x.categorizedRevealHidden)) return false;
  }
  return true;
}

function isStoredMatrix(x: unknown): x is import("./matrixTypes").StoredMatrix {
  if (!isRecord(x)) return false;
  return (
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.updatedAt === "string" &&
    isRiskMatrixSnapshot(x.snapshot)
  );
}

function isWorkspaceV1(x: unknown): x is MatrixWorkspaceV1 {
  if (!isRecord(x)) return false;
  if (x.v !== 1) return false;
  if (x.activeKind !== "default" && x.activeKind !== "saved") return false;
  if (x.activeSavedId !== null && typeof x.activeSavedId !== "string") {
    return false;
  }
  if (x.defaultSnapshot !== null && !isRiskMatrixSnapshot(x.defaultSnapshot)) {
    return false;
  }
  if (!Array.isArray(x.saved) || !x.saved.every(isStoredMatrix)) return false;
  return true;
}

export function normalizeWorkspace(raw: unknown): MatrixWorkspaceV1 {
  if (isWorkspaceV1(raw)) return raw;
  return {
    v: 1,
    activeKind: "default",
    activeSavedId: null,
    defaultSnapshot: null,
    saved: [],
  };
}

export function createLocalMatrixRepository(): MatrixRepository {
  return {
    load(): MatrixWorkspaceV1 {
      if (typeof window === "undefined") {
        return normalizeWorkspace(null);
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return normalizeWorkspace(null);
        return normalizeWorkspace(JSON.parse(raw) as unknown);
      } catch {
        return normalizeWorkspace(null);
      }
    },
    save(workspace: MatrixWorkspaceV1): void {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        // Quota or private mode — ignore; UI still works in-memory.
      }
    },
  };
}
