import * as Y from "yjs";
import { generateKeyBetween } from "fractional-indexing";
import type {
  CellKey,
  GridLine,
  OtherAction,
  PoolLine,
  SubLine,
} from "./types";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Y.Doc shape adapter for a single risk matrix.
 *
 * The Y.Doc holds the **collaboratively-edited** content of one matrix.
 * Per-viewer UI state (collapsed sections, "show hidden" toggles) is NOT
 * synced — that lives in localStorage keyed by matrix id.
 *
 * Top-level: `doc.getMap("matrix")` with:
 *   title:           string (LWW on whole field; no character-level merge)
 *   risks:           Y.Map<riskId, Y.Map>
 *                    Each risk:
 *                      text:     string (LWW)
 *                      location: "pool" | CellKey (LWW — moves resolve here)
 *                      order:    string fractional index (LWW)
 *                      reduce:   Y.Array<Y.Map>   sub-lines: { id, text, starred }
 *                      prepare:  Y.Array<Y.Map>
 *   otherActions:    Y.Array<Y.Map>     each: { id, text }
 *   hiddenRiskKeys:  Y.Map<string, true>  set semantics; cellKey:lineId.
 *                    Y.Map (not Y.Array) so concurrent hides of the same
 *                    key don't insert duplicates.
 *
 * Concurrent moves of the same risk to different cells resolve LWW on the
 * `location` field with no duplication — that's the central reason risks
 * are id-keyed in a single Y.Map rather than nested under each cell.
 *
 * No Y.Text anywhere. The product UX explicitly does not need character-
 * level co-editing of titles or risk text, so all string fields are plain
 * strings that LWW on the whole value.
 */

const ROOT = "matrix";
const TITLE = "title";
const RISKS = "risks";
const OTHER_ACTIONS = "otherActions";
const HIDDEN = "hiddenRiskKeys";

const RISK_TEXT = "text";
const RISK_LOCATION = "location";
const RISK_ORDER = "order";
const RISK_REDUCE = "reduce";
const RISK_PREPARE = "prepare";

const SUB_ID = "id";
const SUB_TEXT = "text";
const SUB_STARRED = "starred";

const OTHER_ID = "id";
const OTHER_TEXT = "text";

export const POOL_LOCATION = "pool";
export type RiskLocation = typeof POOL_LOCATION | CellKey;
export type SubType = "reduce" | "prepare";

type AnyMap = Y.Map<unknown>;

export type MatrixYRoot = {
  doc: Y.Doc;
  root: AnyMap;
  risks: AnyMap;
  otherActions: Y.Array<AnyMap>;
  hidden: AnyMap;
};

/**
 * Initialize a fresh Y.Doc with the matrix structure and seed it with an
 * existing snapshot + title. MUST be called exactly once at create time —
 * never on a Y.Doc that has already received updates from another peer.
 *
 * The fractional-index `order` for each risk is derived from its position
 * in the source snapshot's pool/grid arrays at seed time.
 */
export function seedYDoc(
  doc: Y.Doc,
  args: { title: string; snapshot: RiskMatrixSnapshot },
): MatrixYRoot {
  doc.transact(() => {
    const root = doc.getMap(ROOT) as AnyMap;
    root.set(TITLE, args.title);
    root.set(RISKS, new Y.Map());
    root.set(OTHER_ACTIONS, new Y.Array());
    root.set(HIDDEN, new Y.Map());

    const risks = root.get(RISKS) as AnyMap;
    const otherActions = root.get(OTHER_ACTIONS) as Y.Array<AnyMap>;
    const hidden = root.get(HIDDEN) as AnyMap;

    let order: string | null = null;
    for (const line of args.snapshot.pool) {
      order = generateKeyBetween(order, null);
      risks.set(line.id, makeRiskMap(line, POOL_LOCATION, order));
    }
    for (const [cellKey, lines] of Object.entries(args.snapshot.grid)) {
      let cellOrder: string | null = null;
      for (const line of lines) {
        cellOrder = generateKeyBetween(cellOrder, null);
        risks.set(line.id, makeRiskMap(line, cellKey, cellOrder));
      }
    }
    for (const a of args.snapshot.otherActions) {
      otherActions.push([makeOtherActionMap(a)]);
    }
    for (const k of args.snapshot.hiddenCategorizedRiskKeys) {
      hidden.set(k, true);
    }
  });
  return getRoot(doc);
}

/** Read accessor; assumes the doc has been seeded (or hydrated from a peer). */
export function getRoot(doc: Y.Doc): MatrixYRoot {
  const root = doc.getMap(ROOT) as AnyMap;
  const risks = root.get(RISKS);
  const otherActions = root.get(OTHER_ACTIONS);
  const hidden = root.get(HIDDEN);
  if (!(risks instanceof Y.Map) || !(otherActions instanceof Y.Array) || !(hidden instanceof Y.Map)) {
    throw new Error(
      "Y.Doc has not been seeded — call seedYDoc() before any reads/writes.",
    );
  }
  return {
    doc,
    root,
    risks: risks as AnyMap,
    otherActions: otherActions as Y.Array<AnyMap>,
    hidden: hidden as AnyMap,
  };
}

/** Derive a snapshot + title from the Y.Doc state. Pure read. */
export function readMatrix(doc: Y.Doc): { title: string; snapshot: Pick<RiskMatrixSnapshot, "pool" | "grid" | "otherActions" | "hiddenCategorizedRiskKeys"> } {
  const r = getRoot(doc);
  const title = (r.root.get(TITLE) as string | undefined) ?? "";

  // Bucket risks by location, sort each bucket by (order, riskId) so identical
  // orders still produce a deterministic outcome across replicas.
  const pool: PoolLine[] = [];
  const grid: Record<CellKey, GridLine[]> = {};

  type Entry = { id: string; risk: AnyMap; order: string };
  const buckets: Record<string, Entry[]> = {};
  r.risks.forEach((value, id) => {
    const risk = value as AnyMap;
    const location = (risk.get(RISK_LOCATION) as string | undefined) ?? POOL_LOCATION;
    const order = (risk.get(RISK_ORDER) as string | undefined) ?? "";
    (buckets[location] ??= []).push({ id, risk, order });
  });
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => {
      if (a.order !== b.order) return a.order < b.order ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }

  for (const e of buckets[POOL_LOCATION] ?? []) {
    pool.push({ id: e.id, text: (e.risk.get(RISK_TEXT) as string | undefined) ?? "" });
  }
  for (const [location, list] of Object.entries(buckets)) {
    if (location === POOL_LOCATION) continue;
    grid[location] = list.map((e) => readGridLine(e.id, e.risk));
  }

  const otherActions: OtherAction[] = r.otherActions.map((m) => ({
    id: (m.get(OTHER_ID) as string | undefined) ?? "",
    text: (m.get(OTHER_TEXT) as string | undefined) ?? "",
  }));

  const hiddenCategorizedRiskKeys: string[] = [];
  r.hidden.forEach((v, k) => {
    if (v === true) hiddenCategorizedRiskKeys.push(k);
  });
  hiddenCategorizedRiskKeys.sort();

  return {
    title,
    snapshot: { pool, grid, otherActions, hiddenCategorizedRiskKeys },
  };
}

// — title —
export function setTitle(doc: Y.Doc, title: string): void {
  getRoot(doc).root.set(TITLE, title);
}

// — risks —
export function addRiskToPool(doc: Y.Doc, line: PoolLine): void {
  const r = getRoot(doc);
  doc.transact(() => {
    const order = nextOrderInLocation(r, POOL_LOCATION);
    r.risks.set(line.id, makeRiskMap(line, POOL_LOCATION, order));
  });
}

export function addRiskToCell(doc: Y.Doc, cellKey: CellKey, line: GridLine): void {
  const r = getRoot(doc);
  doc.transact(() => {
    const order = nextOrderInLocation(r, cellKey);
    r.risks.set(line.id, makeRiskMap(line, cellKey, order));
  });
}

export function editRiskText(doc: Y.Doc, riskId: string, text: string): void {
  const risk = getRoot(doc).risks.get(riskId) as AnyMap | undefined;
  if (!risk) return;
  risk.set(RISK_TEXT, text);
}

export function moveRisk(
  doc: Y.Doc,
  riskId: string,
  location: RiskLocation,
  order: string,
): void {
  const risk = getRoot(doc).risks.get(riskId) as AnyMap | undefined;
  if (!risk) return;
  doc.transact(() => {
    risk.set(RISK_LOCATION, location);
    risk.set(RISK_ORDER, order);
  });
}

export function removeRisk(doc: Y.Doc, riskId: string): void {
  getRoot(doc).risks.delete(riskId);
}

// — sub-lines —
export function addSubLine(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  sub: SubLine,
): void {
  const arr = getSubArray(doc, riskId, subType);
  if (!arr) return;
  arr.push([makeSubLineMap(sub)]);
}

export function editSubLineText(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  subId: string,
  text: string,
): void {
  const m = findSubLine(doc, riskId, subType, subId);
  m?.set(SUB_TEXT, text);
}

export function setSubLineStarred(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  subId: string,
  starred: boolean,
): void {
  const m = findSubLine(doc, riskId, subType, subId);
  m?.set(SUB_STARRED, starred);
}

export function removeSubLine(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  subId: string,
): void {
  const arr = getSubArray(doc, riskId, subType);
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    if ((arr.get(i) as AnyMap).get(SUB_ID) === subId) {
      arr.delete(i, 1);
      return;
    }
  }
}

// — other actions —
export function addOtherAction(doc: Y.Doc, action: OtherAction): void {
  getRoot(doc).otherActions.push([makeOtherActionMap(action)]);
}

export function editOtherActionText(doc: Y.Doc, id: string, text: string): void {
  const arr = getRoot(doc).otherActions;
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m.get(OTHER_ID) === id) {
      m.set(OTHER_TEXT, text);
      return;
    }
  }
}

export function removeOtherAction(doc: Y.Doc, id: string): void {
  const arr = getRoot(doc).otherActions;
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i).get(OTHER_ID) === id) {
      arr.delete(i, 1);
      return;
    }
  }
}

// — hidden keys —
export function setHiddenRiskKey(doc: Y.Doc, key: string, hidden: boolean): void {
  const m = getRoot(doc).hidden;
  if (hidden) m.set(key, true);
  else m.delete(key);
}

// — fractional-index helpers —
/** Order key strictly less than every existing risk in a location. */
export function orderBefore(doc: Y.Doc, location: RiskLocation): string {
  const ordered = orderedRiskOrders(doc, location);
  return generateKeyBetween(null, ordered[0] ?? null);
}

/** Order key strictly greater than every existing risk in a location. */
export function orderAfter(doc: Y.Doc, location: RiskLocation): string {
  const ordered = orderedRiskOrders(doc, location);
  return generateKeyBetween(ordered[ordered.length - 1] ?? null, null);
}

/** Order key strictly between two existing keys (or unbounded ends). */
export function orderBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}

// — internals —
function nextOrderInLocation(r: MatrixYRoot, location: RiskLocation): string {
  const orders: string[] = [];
  r.risks.forEach((value) => {
    const risk = value as AnyMap;
    if ((risk.get(RISK_LOCATION) as string) === location) {
      orders.push((risk.get(RISK_ORDER) as string) ?? "");
    }
  });
  orders.sort();
  return generateKeyBetween(orders[orders.length - 1] ?? null, null);
}

function orderedRiskOrders(doc: Y.Doc, location: RiskLocation): string[] {
  const out: string[] = [];
  getRoot(doc).risks.forEach((value) => {
    const risk = value as AnyMap;
    if ((risk.get(RISK_LOCATION) as string) === location) {
      out.push((risk.get(RISK_ORDER) as string) ?? "");
    }
  });
  out.sort();
  return out;
}

function getSubArray(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
): Y.Array<AnyMap> | null {
  const risk = getRoot(doc).risks.get(riskId) as AnyMap | undefined;
  if (!risk) return null;
  const arr = risk.get(subType === "reduce" ? RISK_REDUCE : RISK_PREPARE);
  return arr instanceof Y.Array ? (arr as Y.Array<AnyMap>) : null;
}

function findSubLine(
  doc: Y.Doc,
  riskId: string,
  subType: SubType,
  subId: string,
): AnyMap | null {
  const arr = getSubArray(doc, riskId, subType);
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m.get(SUB_ID) === subId) return m;
  }
  return null;
}

function makeRiskMap(
  line: PoolLine | GridLine,
  location: RiskLocation,
  order: string,
): AnyMap {
  const m = new Y.Map() as AnyMap;
  m.set(RISK_TEXT, line.text);
  m.set(RISK_LOCATION, location);
  m.set(RISK_ORDER, order);
  const reduce = new Y.Array() as Y.Array<AnyMap>;
  const prepare = new Y.Array() as Y.Array<AnyMap>;
  if ("reduce" in line && line.reduce) {
    for (const s of line.reduce) reduce.push([makeSubLineMap(s)]);
  }
  if ("prepare" in line && line.prepare) {
    for (const s of line.prepare) prepare.push([makeSubLineMap(s)]);
  }
  m.set(RISK_REDUCE, reduce);
  m.set(RISK_PREPARE, prepare);
  return m;
}

function makeSubLineMap(s: SubLine): AnyMap {
  const m = new Y.Map() as AnyMap;
  m.set(SUB_ID, s.id);
  m.set(SUB_TEXT, s.text);
  m.set(SUB_STARRED, s.starred);
  return m;
}

function makeOtherActionMap(a: OtherAction): AnyMap {
  const m = new Y.Map() as AnyMap;
  m.set(OTHER_ID, a.id);
  m.set(OTHER_TEXT, a.text);
  return m;
}

function readGridLine(id: string, risk: AnyMap): GridLine {
  const out: GridLine = {
    id,
    text: (risk.get(RISK_TEXT) as string | undefined) ?? "",
  };
  const reduce = risk.get(RISK_REDUCE);
  const prepare = risk.get(RISK_PREPARE);
  if (reduce instanceof Y.Array && reduce.length > 0) {
    out.reduce = (reduce as Y.Array<AnyMap>).map(readSubLine);
  }
  if (prepare instanceof Y.Array && prepare.length > 0) {
    out.prepare = (prepare as Y.Array<AnyMap>).map(readSubLine);
  }
  return out;
}

function readSubLine(m: AnyMap): SubLine {
  return {
    id: (m.get(SUB_ID) as string | undefined) ?? "",
    text: (m.get(SUB_TEXT) as string | undefined) ?? "",
    starred: (m.get(SUB_STARRED) as boolean | undefined) ?? false,
  };
}
