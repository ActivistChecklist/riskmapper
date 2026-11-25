import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applySnapshotDiff, snapshotFromDoc } from "./snapshotDiff";
import { readMatrix, seedYDoc } from "./matrixYDoc";
import { sharedSnapshotFieldsEqual } from "./snapshotEquality";
import type { RiskMatrixSnapshot } from "./matrixTypes";

const EMPTY: RiskMatrixSnapshot = {
  pool: [],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
  otherActions: [],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
  notes: "",
};

function seeded(snap: RiskMatrixSnapshot): Y.Doc {
  const doc = new Y.Doc();
  seedYDoc(doc, { title: "T", snapshot: snap });
  return doc;
}

/** Two replicas of one shared matrix, each update applied to the other. */
function pair(snap: RiskMatrixSnapshot): [Y.Doc, Y.Doc] {
  const a = seeded(snap);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u));
  b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u));
  return [a, b];
}

describe("resources in a shared matrix", () => {
  it("seeds and reads back the list in order", () => {
    const doc = seeded({
      ...EMPTY,
      resources: [
        { id: "rm-res-r-1", text: "A trained medic" },
        { id: "rm-res-r-2", text: "Van for the support team" },
      ],
    });
    expect(readMatrix(doc).snapshot.resources).toEqual([
      { id: "rm-res-r-1", text: "A trained medic" },
      { id: "rm-res-r-2", text: "Van for the support team" },
    ]);
  });

  it("reads a matrix shared before resources existed as having none", () => {
    // A doc seeded by an older app has no resources array at all.
    const doc = new Y.Doc();
    const root = doc.getMap("matrix");
    root.set("title", "Old");
    root.set("risks", new Y.Map());
    root.set("otherActions", new Y.Array());
    root.set("hiddenRiskKeys", new Y.Map());
    expect(readMatrix(doc).snapshot.resources).toEqual([]);
  });

  it("adds, edits and removes resources through the diff, keeping their place", () => {
    const [a, b] = pair({
      ...EMPTY,
      resources: [
        { id: "r1", text: "Medic" },
        { id: "r3", text: "Water" },
      ],
    });
    const prev = snapshotFromDoc(a);
    const next = {
      title: prev.title,
      snapshot: {
        ...prev.snapshot,
        resources: [
          { id: "r1", text: "A trained medic" },
          // Inserted between two existing entries, as Enter does.
          { id: "r2", text: "Shade tent" },
        ],
      },
    };
    applySnapshotDiff(a, prev, next);
    expect(readMatrix(b).snapshot.resources).toEqual([
      { id: "r1", text: "A trained medic" },
      { id: "r2", text: "Shade tent" },
    ]);
    expect(sharedSnapshotFieldsEqual(readMatrix(a).snapshot, next.snapshot)).toBe(true);
  });

  it("emits nothing when the list has not changed", () => {
    const doc = seeded({ ...EMPTY, resources: [{ id: "r1", text: "Medic" }] });
    let updates = 0;
    doc.on("update", () => {
      updates += 1;
    });
    const same = snapshotFromDoc(doc);
    applySnapshotDiff(doc, same, same);
    expect(updates).toBe(0);
  });

  it("keeps entries two people add at once to an old shared matrix", () => {
    // Both start from the same old doc and edit before hearing from each
    // other, then exchange updates.
    const a = seeded(EMPTY);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const add = (doc: Y.Doc, id: string, text: string) => {
      const prev = snapshotFromDoc(doc);
      applySnapshotDiff(doc, prev, {
        title: prev.title,
        snapshot: { ...prev.snapshot, resources: [{ id, text }] },
      });
    };
    add(a, "ra", "Medic");
    add(b, "rb", "Van");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    for (const doc of [a, b]) {
      const texts = (readMatrix(doc).snapshot.resources ?? []).map((r) => r.text).sort();
      expect(texts).toEqual(["Medic", "Van"]);
    }
  });
});
