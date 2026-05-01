import * as Y from "yjs";
import { generateNKeysBetween } from "fractional-indexing";
import { createLogger } from "@/lib/log";
import {
  POOL_LOCATION,
  type RiskLocation,
  type SubType,
  addOtherAction,
  addRiskToCell,
  addRiskToPool,
  addSubLine,
  editOtherActionText,
  editRiskText,
  editSubLineText,
  getRoot,
  moveRisk,
  readMatrix,
  removeOtherAction,
  removeRisk,
  removeSubLine,
  setHiddenRiskKey,
  setSubLineStarred,
  setTitle,
} from "./matrixYDoc";
import type {
  GridLine,
  OtherAction,
  PoolLine,
  SubLine,
} from "./types";
import type { RiskMatrixSnapshot } from "./matrixTypes";

const log = createLogger("rmsync");

/**
 * Translates one snapshot change (prev → next) into the minimum set of
 * Y.Doc ops needed to reproduce it.
 *
 * Idempotent: re-running with the same prev/next is a no-op. The diff
 * compares each field BEFORE mutating, so re-applying a snapshot that
 * already matches the doc emits zero CRDT ops.
 *
 * Stable identity is by id at every level: risks (by id), sub-lines
 * (by id within their reduce/prepare arrays), and other-actions (by id).
 *
 * Ordering is by fractional-index. When a location's risk-id list
 * changes (added, removed, or reordered), every risk in that location is
 * re-keyed with a fresh evenly-spaced sequence — much simpler than
 * neighbor-based incremental order updates and produces a small,
 * predictable burst of ops.
 *
 * `collapsed` and `categorizedRevealHidden` are intentionally not
 * synced — they're per-viewer prefs that live in localStorage.
 */

type SnapshotPart = {
  pool: PoolLine[];
  grid: Record<string, GridLine[]>;
  otherActions: OtherAction[];
  hiddenCategorizedRiskKeys: string[];
  notes: string;
};

export function applySnapshotDiff(
  doc: Y.Doc,
  prev: { title: string; snapshot: SnapshotPart } | null,
  next: { title: string; snapshot: SnapshotPart },
): void {
  doc.transact(() => {
    const root = getRoot(doc);

    // --- title ---
    // Compare against the doc's current title, not against `prev`. A
    // null prev (post-remount) used to trigger a `setTitle` even when
    // the next title already matched the doc.
    const currentTitle = (root.root.get("title") as string | undefined) ?? "";
    if (currentTitle !== next.title) {
      setTitle(doc, next.title);
    }

    // --- assemble per-location id lists ---
    const prevByLoc = collectByLocation(prev?.snapshot);
    const nextByLoc = collectByLocation(next.snapshot);
    const allLocs = new Set<string>([...prevByLoc.keys(), ...nextByLoc.keys()]);

    const prevById = collectById(prev?.snapshot);
    const nextById = collectById(next.snapshot);

    // --- removed risks ---
    // We only trust the cached prev for "this risk WAS here, the user
    // removed it". The doc may legitimately contain risks the user
    // hasn't seen (mid-flight remote updates) — those must NOT be
    // treated as "removed" just because they're absent from prev/next.
    const removedIds: string[] = [];
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) {
        removedIds.push(id);
        removeRisk(doc, id);
      }
    }
    if (removedIds.length > 0) {
      // Smoking-gun signal: a bridge call emitting REMOVE ops is
      // almost always a destructive race. Logged loudly so we can
      // correlate with surrounding events in DevTools.
      log.warn("BRIDGE REMOVE risks", {
        removedIds,
        prevHadCount: prevById.size,
        nextHasCount: nextById.size,
        docHadCount: root.risks.size,
      });
    }

    // --- added or modified risks ---
    // Source of truth for "is this risk new" is the LIVE DOC, not the
    // cached prev. A null/stale prev (e.g., right after a canvas
    // remount when the bridge ref hasn't been seeded yet) would
    // otherwise re-issue addRisk for every existing risk — and
    // addRisk overwrites the risk's Y.Map, tombstoning sub-lines and
    // forcing a destructive re-key. Same defensive check for sub-lines
    // and other actions below.
    for (const [id, info] of nextById) {
      const docHasIt = root.risks.has(id);
      if (!docHasIt) {
        if (info.location === POOL_LOCATION) {
          addRiskToPool(doc, info.line as PoolLine);
        } else {
          addRiskToCell(doc, info.location, info.line as GridLine);
        }
        continue;
      }
      // Already in doc — diff fields against the doc's current values
      // so we don't depend on a (possibly stale) prev.
      const docRisk = root.risks.get(id) as Y.Map<unknown>;
      const docText = (docRisk.get("text") as string | undefined) ?? "";
      if (docText !== info.line.text) {
        editRiskText(doc, id, info.line.text);
      }
      // Sub-lines: diff against the doc-derived previous values, not
      // prev. (When prev is null, the doc's current sub-lines are
      // what's actually there.)
      const prevReduce = docSubLines(docRisk, "reduce");
      const prevPrepare = docSubLines(docRisk, "prepare");
      diffSubLines(doc, id, "reduce", prevReduce, subLines(info.line, "reduce"));
      diffSubLines(doc, id, "prepare", prevPrepare, subLines(info.line, "prepare"));
    }

    // --- ordering: re-key any location whose ordered id-list changed ---
    // We compare next's id-sequence against the DOC's current
    // sequence-by-fractional-index, NOT against prev. This way a stale
    // prev (e.g., null after a remount) doesn't trigger a phantom re-key
    // of every location, which would re-order risks (loosely no-op for
    // the user but each `moveRisk` still creates CRDT ops that POST and
    // fan out, feeding a remount loop).
    for (const loc of allLocs) {
      const nextIds = (nextByLoc.get(loc) ?? []).map((l) => l.id);
      if (nextIds.length === 0) continue;
      const docIdsForLoc = collectDocIdsByOrder(root.risks, loc);
      if (sameSequence(docIdsForLoc, nextIds)) continue;
      const keys = generateNKeysBetween(null, null, nextIds.length);
      for (let i = 0; i < nextIds.length; i++) {
        const riskId = nextIds[i];
        const risk = root.risks.get(riskId) as Y.Map<unknown> | undefined;
        if (!risk) continue;
        const currentLoc = risk.get("location") as string | undefined;
        const currentOrder = risk.get("order") as string | undefined;
        if (currentLoc === loc && currentOrder === keys[i]) continue;
        moveRisk(doc, riskId, loc as RiskLocation, keys[i]);
      }
    }

    // --- otherActions diff ---
    diffOtherActions(
      doc,
      prev?.snapshot.otherActions ?? [],
      next.snapshot.otherActions,
    );

    // --- hidden keys diff ---
    diffHiddenKeys(
      doc,
      prev?.snapshot.hiddenCategorizedRiskKeys ?? [],
      next.snapshot.hiddenCategorizedRiskKeys,
    );

    // --- notes diff (LWW on whole field) ---
    // Compare against the doc's live value so a stale prev (null after
    // a remount) doesn't reset the notes. Concurrent edits clobber on
    // the whole-field set; the typing debounce upstream means
    // collisions only occur when two devices type into the notes
    // editor in the SAME ~300 ms window.
    const currentNotes = (root.root.get("notes") as string | undefined) ?? "";
    if (currentNotes !== next.snapshot.notes) {
      root.root.set("notes", next.snapshot.notes);
    }
  });
}

/**
 * Convert the doc's current state into the same snapshot shape used as
 * the bridge's "previous" baseline. Useful as the seed when wiring up the
 * bridge for the first time on an active record.
 */
export function snapshotFromDoc(doc: Y.Doc): {
  title: string;
  snapshot: Pick<
    RiskMatrixSnapshot,
    "pool" | "grid" | "otherActions" | "hiddenCategorizedRiskKeys" | "notes"
  >;
} {
  return readMatrix(doc);
}

// — internals —
function collectByLocation(snap: SnapshotPart | undefined): Map<string, GridLine[]> {
  const out = new Map<string, GridLine[]>();
  if (!snap) return out;
  out.set(POOL_LOCATION, snap.pool as GridLine[]);
  for (const [k, v] of Object.entries(snap.grid)) out.set(k, v);
  return out;
}

type RiskInfo = { line: PoolLine | GridLine; location: string; position: number };

function collectById(snap: SnapshotPart | undefined): Map<string, RiskInfo> {
  const out = new Map<string, RiskInfo>();
  if (!snap) return out;
  for (let i = 0; i < snap.pool.length; i++) {
    const l = snap.pool[i];
    out.set(l.id, { line: l, location: POOL_LOCATION, position: i });
  }
  for (const [loc, list] of Object.entries(snap.grid)) {
    for (let i = 0; i < list.length; i++) {
      out.set(list[i].id, { line: list[i], location: loc, position: i });
    }
  }
  return out;
}

function subLines(line: PoolLine | GridLine, subType: SubType): SubLine[] {
  const grid = line as GridLine;
  return (subType === "reduce" ? grid.reduce : grid.prepare) ?? [];
}

function docSubLines(risk: Y.Map<unknown>, subType: SubType): SubLine[] {
  const arr = risk.get(subType === "reduce" ? "reduce" : "prepare");
  if (!(arr instanceof Y.Array)) return [];
  const out: SubLine[] = [];
  arr.forEach((m: unknown) => {
    if (!(m instanceof Y.Map)) return;
    out.push({
      id: (m.get("id") as string | undefined) ?? "",
      text: (m.get("text") as string | undefined) ?? "",
      starred: (m.get("starred") as boolean | undefined) ?? false,
    });
  });
  return out;
}

function sameSequence(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Read the doc's current id-sequence for a location, ordered by the
 * fractional `order` field (with id as deterministic tiebreaker —
 * mirrors `readMatrix`'s sort).
 */
function collectDocIdsByOrder(
  risks: Y.Map<unknown>,
  location: string,
): string[] {
  type Entry = { id: string; order: string };
  const entries: Entry[] = [];
  risks.forEach((value: unknown, id: string) => {
    if (!(value instanceof Y.Map)) return;
    if ((value.get("location") as string | undefined) !== location) return;
    entries.push({
      id,
      order: (value.get("order") as string | undefined) ?? "",
    });
  });
  entries.sort((a, b) => {
    if (a.order !== b.order) return a.order < b.order ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return entries.map((e) => e.id);
}

function diffSubLines(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  prev: SubLine[],
  next: SubLine[],
): void {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextById = new Map(next.map((s) => [s.id, s]));
  // Removals: trust prev so we only remove what the user actually
  // had visible and dropped.
  const removed: string[] = [];
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      removed.push(id);
      removeSubLine(doc, riskId, subType, id);
    }
  }
  if (removed.length > 0) {
    log.warn("BRIDGE REMOVE sub-lines", {
      riskId,
      subType,
      removed,
      prevCount: prev.length,
      nextCount: next.length,
    });
  }
  // Adds vs modifies — check the LIVE doc's sub-lines, not just prev,
  // so a stale prev doesn't double-add.
  const root = getRoot(doc);
  const risk = root.risks.get(riskId) as Y.Map<unknown> | undefined;
  const liveById = new Map<string, SubLine>();
  if (risk) {
    for (const s of docSubLines(risk, subType)) liveById.set(s.id, s);
  }
  for (const s of next) {
    const live = liveById.get(s.id);
    if (!live) {
      addSubLine(doc, riskId, subType, s);
      continue;
    }
    if (live.text !== s.text) editSubLineText(doc, riskId, subType, s.id, s.text);
    if (live.starred !== s.starred) setSubLineStarred(doc, riskId, subType, s.id, s.starred);
  }
}

function diffOtherActions(
  doc: Y.Doc,
  prev: OtherAction[],
  next: OtherAction[],
): void {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));
  // Doc-derived id->text map so we can decide add-vs-edit against the
  // live state, not the (possibly stale) prev. Same hardening as the
  // risk diff above.
  const docMap = new Map<string, string>();
  const arr = (doc.getMap("matrix").get("otherActions") as
    | Y.Array<Y.Map<unknown>>
    | undefined) ?? null;
  if (arr) {
    arr.forEach((m: Y.Map<unknown>) => {
      const id = m.get("id") as string | undefined;
      const text = m.get("text") as string | undefined;
      if (id) docMap.set(id, text ?? "");
    });
  }
  const removedOtherIds: string[] = [];
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      removedOtherIds.push(id);
      removeOtherAction(doc, id);
    }
  }
  if (removedOtherIds.length > 0) {
    log.warn("BRIDGE REMOVE other-actions", {
      removed: removedOtherIds,
      prevCount: prev.length,
      nextCount: next.length,
    });
  }
  for (const a of next) {
    if (docMap.has(a.id)) {
      // Already in doc — only emit edit if text differs. Skip the
      // add path entirely so we don't push a duplicate Y.Map.
      if (docMap.get(a.id) !== a.text) {
        editOtherActionText(doc, a.id, a.text);
      }
      continue;
    }
    addOtherAction(doc, a);
  }
}

function diffHiddenKeys(doc: Y.Doc, prev: string[], next: string[]): void {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  // Compare against the doc's live set so a stale/null prev doesn't
  // re-set keys that already exist (Y.Map.set always creates a new
  // CRDT entry, even when the value is unchanged).
  const root = getRoot(doc);
  const liveSet = new Set<string>();
  root.hidden.forEach((v: unknown, k: string) => {
    if (v === true) liveSet.add(k);
  });
  for (const k of prevSet) {
    if (!nextSet.has(k) && liveSet.has(k)) setHiddenRiskKey(doc, k, false);
  }
  for (const k of nextSet) {
    if (!liveSet.has(k)) setHiddenRiskKey(doc, k, true);
  }
}
