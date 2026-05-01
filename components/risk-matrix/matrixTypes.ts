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
  /** Ad-hoc actions listed below starred items in the Actions panel. */
  otherActions: OtherAction[];
  /** `cellKey:lineId` keys hidden from the categorized mitigations list until revealed. */
  hiddenCategorizedRiskKeys: string[];
  categorizedRevealHidden: CategorizedRevealHiddenState;
  /**
   * Free-form Markdown notes, rendered through a WYSIWYG editor
   * below the Actions panel. Stored as Markdown so exports /
   * round-trips stay inspectable. The notes editor uses a custom
   * Paragraph serializer that emits an NBSP for otherwise-empty
   * paragraphs so multi-line structure (consecutive Enter presses)
   * survives the CommonMark blank-line collapse on parse — see
   * NotesEditor.tsx. Concurrent edits resolve last-writer-wins
   * (debounced) — same model as the risk text fields.
   */
  notes: string;
};

/**
 * Local cache of cloud-sync metadata for a saved matrix. Present iff the
 * user has opted into cloud sync for this matrix.
 *
 * `lastHeadSeq` lets a returning client request `?since=N` on cold load
 * and skip re-downloading the baseline.
 *
 * `yDocStateB64` is the encoded Y.Doc state (base64url) at the moment of
 * persistence — restored on load so local-only edits survive a tab close
 * even if the network was unreachable when they happened.
 */
export type CloudMatrixMeta = {
  recordId: string;
  /** Base64url-no-pad XChaCha20-Poly1305 key. Empty string ⇒ session-only. */
  keyB64: string;
  lastHeadSeq: number;
  yDocStateB64: string;
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
