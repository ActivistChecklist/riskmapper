import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  POOL_LOCATION,
  addOtherAction,
  addRiskToPool,
  addSubLine,
  editOtherActionText,
  editRiskText,
  editSubLineText,
  getRoot,
  moveRisk,
  orderAfter,
  orderBefore,
  orderBetween,
  readMatrix,
  removeOtherAction,
  removeRisk,
  removeSubLine,
  seedYDoc,
  setHiddenRiskKey,
  setSubLineStarred,
  setTitle,
} from "./matrixYDoc";
import type { RiskMatrixSnapshot } from "./matrixTypes";

const EMPTY_SNAPSHOT: RiskMatrixSnapshot = {
  pool: [],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
  otherActions: [],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
};

const SAMPLE_SNAPSHOT: RiskMatrixSnapshot = {
  pool: [
    { id: "p-1", text: "First pool risk" },
    { id: "p-2", text: "Second pool risk" },
  ],
  grid: {
    "1-1": [
      {
        id: "g-1",
        text: "Grid risk red-high",
        reduce: [{ id: "r-1", text: "do thing", starred: true }],
        prepare: [{ id: "pr-1", text: "have plan", starred: false }],
      },
    ],
    "0-0": [{ id: "g-2", text: "Grid risk green-low" }],
  },
  collapsed: { red: false, orange: false, yellow: true, green: false },
  otherActions: [
    { id: "o-1", text: "buy supplies" },
    { id: "o-2", text: "" },
  ],
  hiddenCategorizedRiskKeys: ["1-1:g-1"],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
};

function newDoc(): Y.Doc {
  return new Y.Doc();
}

/** Mirror updates from `from` into `to` in both directions. */
function syncOnce(a: Y.Doc, b: Y.Doc): void {
  const aUpdate = Y.encodeStateAsUpdate(a);
  const bUpdate = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(b, aUpdate);
  Y.applyUpdate(a, bUpdate);
}

describe("matrixYDoc — round-trip", () => {
  it("seeds an empty doc and reads back an empty matrix", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "T", snapshot: EMPTY_SNAPSHOT });
    const out = readMatrix(doc);
    expect(out.title).toBe("T");
    expect(out.snapshot.pool).toEqual([]);
    expect(out.snapshot.grid).toEqual({});
    expect(out.snapshot.otherActions).toEqual([]);
    expect(out.snapshot.hiddenCategorizedRiskKeys).toEqual([]);
  });

  it("preserves pool, grid, sub-lines, otherActions, hidden keys, and title", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "Tornado planning", snapshot: SAMPLE_SNAPSHOT });
    const out = readMatrix(doc);
    expect(out.title).toBe("Tornado planning");
    expect(out.snapshot.pool).toEqual(SAMPLE_SNAPSHOT.pool);
    expect(out.snapshot.grid).toEqual(SAMPLE_SNAPSHOT.grid);
    expect(out.snapshot.otherActions).toEqual(SAMPLE_SNAPSHOT.otherActions);
    expect(out.snapshot.hiddenCategorizedRiskKeys).toEqual(
      SAMPLE_SNAPSHOT.hiddenCategorizedRiskKeys,
    );
  });

  it("seed -> encodeStateAsUpdate -> applyUpdate to fresh doc yields equal state", () => {
    const a = newDoc();
    seedYDoc(a, { title: "X", snapshot: SAMPLE_SNAPSHOT });
    const b = newDoc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readMatrix(b)).toEqual(readMatrix(a));
  });
});

describe("matrixYDoc — local mutations", () => {
  it("setTitle replaces the title", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "old", snapshot: EMPTY_SNAPSHOT });
    setTitle(doc, "new");
    expect(readMatrix(doc).title).toBe("new");
  });

  it("addRiskToPool appends in order", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    addRiskToPool(doc, { id: "a", text: "A" });
    addRiskToPool(doc, { id: "b", text: "B" });
    addRiskToPool(doc, { id: "c", text: "C" });
    expect(readMatrix(doc).snapshot.pool.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("moveRisk pool -> cell relocates without duplicating", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    addRiskToPool(doc, { id: "a", text: "A" });
    moveRisk(doc, "a", "2-3", orderAfter(doc, "2-3"));
    const s = readMatrix(doc).snapshot;
    expect(s.pool).toEqual([]);
    expect(s.grid["2-3"]).toEqual([{ id: "a", text: "A" }]);
  });

  it("removeRisk drops the risk from its location", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: SAMPLE_SNAPSHOT });
    removeRisk(doc, "p-1");
    expect(readMatrix(doc).snapshot.pool.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("editRiskText replaces just the text field", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: SAMPLE_SNAPSHOT });
    editRiskText(doc, "p-1", "renamed");
    const pool = readMatrix(doc).snapshot.pool;
    expect(pool.find((p) => p.id === "p-1")?.text).toBe("renamed");
  });

  it("sub-line ops add/edit/star/remove", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: SAMPLE_SNAPSHOT });
    addSubLine(doc, "g-1", "reduce", { id: "r-2", text: "extra", starred: false });
    editSubLineText(doc, "g-1", "reduce", "r-1", "edited");
    setSubLineStarred(doc, "g-1", "reduce", "r-2", true);
    removeSubLine(doc, "g-1", "prepare", "pr-1");
    const grid = readMatrix(doc).snapshot.grid;
    expect(grid["1-1"][0].reduce).toEqual([
      { id: "r-1", text: "edited", starred: true },
      { id: "r-2", text: "extra", starred: true },
    ]);
    expect(grid["1-1"][0].prepare).toBeUndefined();
  });

  it("other actions add/edit/remove", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    addOtherAction(doc, { id: "a", text: "alpha" });
    addOtherAction(doc, { id: "b", text: "beta" });
    editOtherActionText(doc, "a", "ALPHA");
    removeOtherAction(doc, "b");
    expect(readMatrix(doc).snapshot.otherActions).toEqual([
      { id: "a", text: "ALPHA" },
    ]);
  });

  it("hidden keys toggle is set-semantic", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    setHiddenRiskKey(doc, "1-1:r1", true);
    setHiddenRiskKey(doc, "1-1:r1", true);
    setHiddenRiskKey(doc, "0-0:r2", true);
    expect(readMatrix(doc).snapshot.hiddenCategorizedRiskKeys.sort()).toEqual([
      "0-0:r2",
      "1-1:r1",
    ]);
    setHiddenRiskKey(doc, "1-1:r1", false);
    expect(readMatrix(doc).snapshot.hiddenCategorizedRiskKeys).toEqual([
      "0-0:r2",
    ]);
  });
});

describe("matrixYDoc — fractional ordering", () => {
  it("orderBetween allows infinite insertion between two keys", () => {
    const lo = "a0";
    let hi = "a1";
    for (let i = 0; i < 10; i++) {
      const mid = orderBetween(lo, hi);
      expect(mid > lo).toBe(true);
      expect(mid < hi).toBe(true);
      hi = mid;
    }
  });

  it("inserting between two pool risks renders in the correct order", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    addRiskToPool(doc, { id: "a", text: "A" });
    addRiskToPool(doc, { id: "c", text: "C" });
    // Insert "b" between a and c using orderBetween of their orders.
    const r = getRoot(doc);
    const aOrder = (r.risks.get("a") as Y.Map<unknown>).get("order") as string;
    const cOrder = (r.risks.get("c") as Y.Map<unknown>).get("order") as string;
    addRiskToPool(doc, { id: "b", text: "B" });
    moveRisk(doc, "b", POOL_LOCATION, orderBetween(aOrder, cOrder));
    expect(readMatrix(doc).snapshot.pool.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("orderBefore/orderAfter produce keys outside existing range", () => {
    const doc = newDoc();
    seedYDoc(doc, { title: "", snapshot: EMPTY_SNAPSHOT });
    addRiskToPool(doc, { id: "a", text: "A" });
    addRiskToPool(doc, { id: "b", text: "B" });
    addRiskToPool(doc, { id: "head", text: "head" });
    addRiskToPool(doc, { id: "tail", text: "tail" });
    moveRisk(doc, "head", POOL_LOCATION, orderBefore(doc, POOL_LOCATION));
    moveRisk(doc, "tail", POOL_LOCATION, orderAfter(doc, POOL_LOCATION));
    expect(readMatrix(doc).snapshot.pool.map((p) => p.id)).toEqual([
      "head",
      "a",
      "b",
      "tail",
    ]);
  });
});

describe("matrixYDoc — concurrent edits", () => {
  it("two clients independently adding risks both end up in the pool", () => {
    const a = newDoc();
    const b = newDoc();
    seedYDoc(a, { title: "", snapshot: EMPTY_SNAPSHOT });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    addRiskToPool(a, { id: "from-a", text: "A's risk" });
    addRiskToPool(b, { id: "from-b", text: "B's risk" });
    syncOnce(a, b);

    const ids = (d: Y.Doc) => readMatrix(d).snapshot.pool.map((p) => p.id).sort();
    expect(ids(a)).toEqual(["from-a", "from-b"]);
    expect(ids(b)).toEqual(["from-a", "from-b"]);
  });

  it("two clients moving the SAME risk to different cells: no duplication, both replicas converge", () => {
    const a = newDoc();
    const b = newDoc();
    seedYDoc(a, { title: "", snapshot: EMPTY_SNAPSHOT });
    addRiskToPool(a, { id: "x", text: "X" });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    moveRisk(a, "x", "1-1", orderAfter(a, "1-1"));
    moveRisk(b, "x", "0-0", orderAfter(b, "0-0"));
    syncOnce(a, b);

    const sa = readMatrix(a).snapshot;
    const sb = readMatrix(b).snapshot;
    expect(sa).toEqual(sb);
    // Risk lives in exactly one cell; pool empty.
    expect(sa.pool).toEqual([]);
    const cells = Object.entries(sa.grid).filter(([, list]) => list.length > 0);
    expect(cells.length).toBe(1);
    expect(cells[0][1].map((l) => l.id)).toEqual(["x"]);
  });

  it("two clients editing different risks both edits land on both replicas", () => {
    const a = newDoc();
    const b = newDoc();
    seedYDoc(a, { title: "", snapshot: SAMPLE_SNAPSHOT });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    editRiskText(a, "p-1", "A edit");
    editRiskText(b, "p-2", "B edit");
    syncOnce(a, b);

    const ra = readMatrix(a).snapshot.pool;
    const rb = readMatrix(b).snapshot.pool;
    expect(ra.find((p) => p.id === "p-1")?.text).toBe("A edit");
    expect(ra.find((p) => p.id === "p-2")?.text).toBe("B edit");
    expect(rb).toEqual(ra);
  });

  it("two clients hiding the same risk key: still set-semantic after sync", () => {
    const a = newDoc();
    const b = newDoc();
    seedYDoc(a, { title: "", snapshot: EMPTY_SNAPSHOT });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    setHiddenRiskKey(a, "1-1:r1", true);
    setHiddenRiskKey(b, "1-1:r1", true);
    syncOnce(a, b);

    expect(readMatrix(a).snapshot.hiddenCategorizedRiskKeys).toEqual(["1-1:r1"]);
    expect(readMatrix(b).snapshot.hiddenCategorizedRiskKeys).toEqual(["1-1:r1"]);
  });

  it("delete on one side, edit on the other: both replicas end with the risk gone", () => {
    const a = newDoc();
    const b = newDoc();
    seedYDoc(a, { title: "", snapshot: SAMPLE_SNAPSHOT });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    removeRisk(a, "p-1");
    editRiskText(b, "p-1", "B's edit (will lose)");
    syncOnce(a, b);

    // Yjs Y.Map.delete tombstones the entry; concurrent edits to the deleted
    // entry's fields don't resurrect it.
    const sa = readMatrix(a).snapshot.pool.map((p) => p.id);
    const sb = readMatrix(b).snapshot.pool.map((p) => p.id);
    expect(sa).toEqual(sb);
    expect(sa).not.toContain("p-1");
  });
});
