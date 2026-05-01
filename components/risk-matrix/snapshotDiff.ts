import * as Y from "yjs";
import { generateNKeysBetween } from "fractional-indexing";
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
};

export function applySnapshotDiff(
  doc: Y.Doc,
  prev: { title: string; snapshot: SnapshotPart } | null,
  next: { title: string; snapshot: SnapshotPart },
): void {
  doc.transact(() => {
    const root = getRoot(doc);

    // --- title ---
    const currentTitle = (root.root.get("title") as string | undefined) ?? "";
    if (currentTitle !== next.title) setTitle(doc, next.title);

    // --- assemble per-location id lists ---
    const prevByLoc = collectByLocation(prev?.snapshot);
    const nextByLoc = collectByLocation(next.snapshot);
    const allLocs = new Set<string>([...prevByLoc.keys(), ...nextByLoc.keys()]);

    const prevById = collectById(prev?.snapshot);
    const nextById = collectById(next.snapshot);

    // --- removed risks ---
    for (const id of prevById.keys()) {
      if (!nextById.has(id)) removeRisk(doc, id);
    }

    // --- added risks ---
    // Adds at this stage get whatever order `nextOrderInLocation` returns.
    // If the location's id list changed at all, the re-keying pass below
    // will overwrite it with a clean fractional index.
    for (const [id, info] of nextById) {
      if (prevById.has(id)) continue;
      if (info.location === POOL_LOCATION) {
        addRiskToPool(doc, info.line as PoolLine);
      } else {
        addRiskToCell(doc, info.location, info.line as GridLine);
      }
    }

    // --- text + sub-line diffs for risks present in both ---
    for (const [id, info] of nextById) {
      const old = prevById.get(id);
      if (!old) continue;
      if (old.line.text !== info.line.text) {
        editRiskText(doc, id, info.line.text);
      }
      diffSubLines(doc, id, "reduce", subLines(old.line, "reduce"), subLines(info.line, "reduce"));
      diffSubLines(doc, id, "prepare", subLines(old.line, "prepare"), subLines(info.line, "prepare"));
    }

    // --- ordering: re-key any location whose ordered id-list changed ---
    for (const loc of allLocs) {
      const prevIds = (prevByLoc.get(loc) ?? []).map((l) => l.id);
      const nextIds = (nextByLoc.get(loc) ?? []).map((l) => l.id);
      if (sameSequence(prevIds, nextIds)) continue;
      if (nextIds.length === 0) continue;
      const keys = generateNKeysBetween(null, null, nextIds.length);
      for (let i = 0; i < nextIds.length; i++) {
        // moveRisk also re-asserts location, so this handles cross-location
        // moves uniformly with reorder-within-location.
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
  });
}

/**
 * Convert the doc's current state into the same snapshot shape used as
 * the bridge's "previous" baseline. Useful as the seed when wiring up the
 * bridge for the first time on an active record.
 */
export function snapshotFromDoc(doc: Y.Doc): {
  title: string;
  snapshot: Pick<RiskMatrixSnapshot, "pool" | "grid" | "otherActions" | "hiddenCategorizedRiskKeys">;
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

function sameSequence(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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
  // Removals
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) removeSubLine(doc, riskId, subType, id);
  }
  // Adds (append; ordering across sub-lines isn't user-controlled today)
  for (const s of next) {
    if (prevById.has(s.id)) continue;
    addSubLine(doc, riskId, subType, s);
  }
  // Modifies
  for (const s of next) {
    const old = prevById.get(s.id);
    if (!old) continue;
    if (old.text !== s.text) editSubLineText(doc, riskId, subType, s.id, s.text);
    if (old.starred !== s.starred) setSubLineStarred(doc, riskId, subType, s.id, s.starred);
  }
}

function diffOtherActions(
  doc: Y.Doc,
  prev: OtherAction[],
  next: OtherAction[],
): void {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) removeOtherAction(doc, id);
  }
  for (const a of next) {
    if (prevById.has(a.id)) continue;
    addOtherAction(doc, a);
  }
  for (const a of next) {
    const old = prevById.get(a.id);
    if (!old) continue;
    if (old.text !== a.text) editOtherActionText(doc, a.id, a.text);
  }
}

function diffHiddenKeys(doc: Y.Doc, prev: string[], next: string[]): void {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  for (const k of prevSet) if (!nextSet.has(k)) setHiddenRiskKey(doc, k, false);
  for (const k of nextSet) if (!prevSet.has(k)) setHiddenRiskKey(doc, k, true);
}
