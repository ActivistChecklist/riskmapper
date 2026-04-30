import type {
  CategorizedRevealHiddenState,
  CellKey,
  CollapsedState,
  GridLine,
  OtherAction,
  PoolLine,
} from "./types";

/** Default title for the draft matrix (`activeKind === "default"`) until the user sets one. */
export const DEFAULT_DRAFT_MATRIX_TITLE = "Untitled";

/** Serializable matrix state for persistence (pool, grid, UI prefs). */
export type RiskMatrixSnapshot = {
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  collapsed: CollapsedState;
  hasCompletedFirstDragToMatrix: boolean;
  /** Ad-hoc actions listed below starred items in the Actions panel. */
  otherActions: OtherAction[];
  /** `cellKey:lineId` keys hidden from the categorized mitigations list until revealed. */
  hiddenCategorizedRiskKeys: string[];
  categorizedRevealHidden: CategorizedRevealHiddenState;
};

/**
 * Local cache of cloud-sync metadata for a saved matrix. Present iff the user
 * has opted into cloud sync for this matrix. Note that `keyB64` is **only**
 * persisted after explicit user action ("Save on this device"); for an
 * inbound shared link viewed in sandbox mode, the key lives in memory only.
 */
export type CloudMatrixMeta = {
  recordId: string;
  /** Base64url-no-pad XChaCha20-Poly1305 key. Empty string ⇒ session-only. */
  keyB64: string;
  lastSyncedVersion: number;
  lastSyncedLamport: number;
};

export type StoredMatrix = {
  id: string;
  title: string;
  updatedAt: string;
  snapshot: RiskMatrixSnapshot;
  cloud?: CloudMatrixMeta;
};

export type MatrixWorkspaceV1 = {
  v: 1;
  activeKind: "default" | "saved";
  activeSavedId: string | null;
  defaultSnapshot: RiskMatrixSnapshot | null;
  /** Title for the in-memory draft when `activeKind === "default"` (not a saved row). Blank values normalize to `DEFAULT_DRAFT_MATRIX_TITLE` on load. */
  draftTitle: string;
  saved: StoredMatrix[];
};

/** Abstract persistence for swapping localStorage with an API later. */
export type MatrixRepository = {
  load(): MatrixWorkspaceV1;
  save(workspace: MatrixWorkspaceV1): void;
};
