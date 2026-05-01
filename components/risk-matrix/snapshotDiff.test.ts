import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applySnapshotDiff, snapshotFromDoc } from "./snapshotDiff";
import { readMatrix, seedYDoc } from "./matrixYDoc";
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

function newSeededDoc(snap: RiskMatrixSnapshot, title = ""): Y.Doc {
  const d = new Y.Doc();
  seedYDoc(d, { title, snapshot: snap });
  return d;
}

describe("applySnapshotDiff", () => {
  it("is a no-op when prev equals next (idempotent)", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      pool: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      otherActions: [{ id: "o", text: "do thing" }],
    }, "Tornado");

    let opCount = 0;
    doc.on("update", () => {
      opCount += 1;
    });

    const before = snapshotFromDoc(doc);
    applySnapshotDiff(doc, before, before);
    expect(opCount).toBe(0);
  });

  it("applies title change", () => {
    const doc = newSeededDoc(EMPTY, "old");
    const next = { title: "new", snapshot: EMPTY };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).title).toBe("new");
  });

  it("adds a risk to the pool", () => {
    const doc = newSeededDoc(EMPTY, "");
    const before = snapshotFromDoc(doc);
    const next = {
      title: "",
      snapshot: { ...EMPTY, pool: [{ id: "a", text: "A" }] },
    };
    applySnapshotDiff(doc, before, next);
    const out = readMatrix(doc);
    expect(out.snapshot.pool).toEqual([{ id: "a", text: "A" }]);
  });

  it("removes a risk", () => {
    const doc = newSeededDoc({ ...EMPTY, pool: [{ id: "a", text: "A" }, { id: "b", text: "B" }] });
    const next = { title: "", snapshot: { ...EMPTY, pool: [{ id: "b", text: "B" }] } };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).snapshot.pool).toEqual([{ id: "b", text: "B" }]);
  });

  it("edits a risk's text", () => {
    const doc = newSeededDoc({ ...EMPTY, pool: [{ id: "a", text: "old" }] });
    const next = {
      title: "",
      snapshot: { ...EMPTY, pool: [{ id: "a", text: "new" }] },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).snapshot.pool[0].text).toBe("new");
  });

  it("moves a risk from pool to a grid cell", () => {
    const doc = newSeededDoc({ ...EMPTY, pool: [{ id: "a", text: "A" }] });
    const next = {
      title: "",
      snapshot: { ...EMPTY, pool: [], grid: { "1-1": [{ id: "a", text: "A" }] } },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    const s = readMatrix(doc).snapshot;
    expect(s.pool).toEqual([]);
    expect(s.grid["1-1"]).toEqual([{ id: "a", text: "A" }]);
  });

  it("reorders within a location", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      pool: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
      ],
    });
    const next = {
      title: "",
      snapshot: {
        ...EMPTY,
        pool: [
          { id: "c", text: "C" },
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
      },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).snapshot.pool.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("diffs sub-lines: add, edit text, toggle starred, remove", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      grid: {
        "0-0": [
          {
            id: "g",
            text: "risk",
            reduce: [
              { id: "r1", text: "do x", starred: false },
              { id: "r2", text: "do y", starred: false },
            ],
          },
        ],
      },
    });
    const next = {
      title: "",
      snapshot: {
        ...EMPTY,
        grid: {
          "0-0": [
            {
              id: "g",
              text: "risk",
              reduce: [
                { id: "r1", text: "do x EDITED", starred: true },
                { id: "r3", text: "added", starred: false },
              ],
            },
          ],
        },
      },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    const out = readMatrix(doc);
    expect(out.snapshot.grid["0-0"][0].reduce).toEqual([
      { id: "r1", text: "do x EDITED", starred: true },
      { id: "r3", text: "added", starred: false },
    ]);
  });

  it("diffs other actions", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      otherActions: [
        { id: "a", text: "alpha" },
        { id: "b", text: "beta" },
      ],
    });
    const next = {
      title: "",
      snapshot: {
        ...EMPTY,
        otherActions: [
          { id: "a", text: "ALPHA" },
          { id: "c", text: "gamma" },
        ],
      },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).snapshot.otherActions).toEqual([
      { id: "a", text: "ALPHA" },
      { id: "c", text: "gamma" },
    ]);
  });

  it("diffs hidden risk keys (set semantics)", () => {
    const doc = newSeededDoc({ ...EMPTY, hiddenCategorizedRiskKeys: ["x:1", "y:2"] });
    const next = {
      title: "",
      snapshot: { ...EMPTY, hiddenCategorizedRiskKeys: ["y:2", "z:3"] },
    };
    applySnapshotDiff(doc, snapshotFromDoc(doc), next);
    expect(readMatrix(doc).snapshot.hiddenCategorizedRiskKeys.sort()).toEqual([
      "y:2",
      "z:3",
    ]);
  });

  it("two replicas applying disjoint local snapshot edits converge after sync", () => {
    const seed: RiskMatrixSnapshot = {
      ...EMPTY,
      pool: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
    };
    const a = newSeededDoc(seed);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // a edits text on "a"; b edits text on "b"
    applySnapshotDiff(a, snapshotFromDoc(a), {
      title: "",
      snapshot: { ...seed, pool: [{ id: "a", text: "A-from-A" }, { id: "b", text: "B" }] },
    });
    applySnapshotDiff(b, snapshotFromDoc(b), {
      title: "",
      snapshot: { ...seed, pool: [{ id: "a", text: "A" }, { id: "b", text: "B-from-B" }] },
    });

    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const sa = readMatrix(a).snapshot.pool;
    const sb = readMatrix(b).snapshot.pool;
    expect(sa).toEqual(sb);
    expect(sa.find((p) => p.id === "a")?.text).toBe("A-from-A");
    expect(sa.find((p) => p.id === "b")?.text).toBe("B-from-B");
  });

  it("emits zero ops on identity diff (regression)", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      pool: [{ id: "a", text: "A" }],
      grid: { "1-1": [{ id: "g", text: "G", reduce: [{ id: "r1", text: "x", starred: false }] }] },
      otherActions: [{ id: "o", text: "x" }],
      hiddenCategorizedRiskKeys: ["a:1"],
    });
    const before = snapshotFromDoc(doc);
    let ops = 0;
    doc.on("update", () => {
      ops += 1;
    });
    applySnapshotDiff(doc, before, before);
    expect(ops).toBe(0);
  });

  // Regression: a remount used to leave `lastBridgedRef` at null on
  // its first onSnapshotChange call. With prev=null, the diff treated
  // every existing risk as "new" and called addRiskToPool/Cell, which
  // overwrote the existing Y.Map (tombstoning sub-lines and re-keying
  // orders). The resulting flurry of ops POSTed to the server, fanned
  // out via SSE, and triggered the receiving client to remount and
  // emit its own phantom ops — feedback loop.
  it("with prev=null but next matching the doc, emits zero ops (phantom-diff regression)", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      pool: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      grid: {
        "1-1": [
          {
            id: "g",
            text: "Risk",
            reduce: [{ id: "r1", text: "do x", starred: true }],
            prepare: [{ id: "p1", text: "have plan", starred: false }],
          },
        ],
      },
      otherActions: [{ id: "o1", text: "alpha" }],
      hiddenCategorizedRiskKeys: ["1-1:g"],
    });
    const view = snapshotFromDoc(doc);
    let ops = 0;
    doc.on("update", () => {
      ops += 1;
    });
    // prev=null is the post-remount situation. next is the snapshot
    // derived from the doc, which is what useRiskMatrix's initial state
    // would be after the remount.
    applySnapshotDiff(doc, null, { title: view.title, snapshot: view.snapshot });
    expect(ops).toBe(0);
  });

  it("with prev=null, sub-lines on existing risks are preserved", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      grid: {
        "0-0": [
          {
            id: "g",
            text: "risk",
            reduce: [
              { id: "r1", text: "first", starred: false },
              { id: "r2", text: "second", starred: true },
            ],
          },
        ],
      },
    });
    const view = snapshotFromDoc(doc);
    applySnapshotDiff(doc, null, { title: view.title, snapshot: view.snapshot });
    // Sub-lines must survive a phantom diff.
    const after = snapshotFromDoc(doc);
    expect(after.snapshot.grid["0-0"][0].reduce).toEqual([
      { id: "r1", text: "first", starred: false },
      { id: "r2", text: "second", starred: true },
    ]);
  });

  it("with prev=null, a real local edit still applies", () => {
    const doc = newSeededDoc({
      ...EMPTY,
      pool: [{ id: "a", text: "old" }],
    });
    // User typed; useRiskMatrix produced this snapshot. lastBridgedRef
    // is null (post-remount).
    const next = {
      title: "",
      snapshot: { ...EMPTY, pool: [{ id: "a", text: "new" }] },
    };
    applySnapshotDiff(doc, null, next);
    expect(snapshotFromDoc(doc).snapshot.pool).toEqual([{ id: "a", text: "new" }]);
  });

  it("notes round-trip: seed, edit, idempotent re-apply", () => {
    const doc = newSeededDoc({ ...EMPTY, notes: "# Initial heading\n\nA paragraph." });
    expect(snapshotFromDoc(doc).snapshot.notes).toBe(
      "# Initial heading\n\nA paragraph.",
    );

    let ops = 0;
    doc.on("update", () => {
      ops += 1;
    });

    // Re-applying the same snapshot must be a no-op.
    applySnapshotDiff(doc, null, {
      title: "",
      snapshot: { ...EMPTY, notes: "# Initial heading\n\nA paragraph." },
    });
    expect(ops).toBe(0);

    // Editing the notes flows through.
    applySnapshotDiff(doc, null, {
      title: "",
      snapshot: { ...EMPTY, notes: "# Heading\n\n- bullet" },
    });
    expect(snapshotFromDoc(doc).snapshot.notes).toBe("# Heading\n\n- bullet");
  });
});
