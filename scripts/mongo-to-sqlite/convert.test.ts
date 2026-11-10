// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, openDatabase, type SqliteStore } from "../../lib/cloud/sqliteStore.mts";
import {
  dumpMatrices,
  dumpUpdates,
  makeTempDb,
  matrixDoc,
  seedMatrix,
  type TempDb,
} from "../../lib/cloud/sqliteTestUtils";
import {
  formatReport,
  matrixFromMongo,
  replaceWithSource,
  updateFromMongo,
  type SourceDoc,
} from "./convert.mts";

/**
 * The copy's conversion and write path, fed plain objects shaped like what
 * the mongodb driver returns. `copy.mts` itself only adds the driver.
 */

const A = "aaaa0000000000000000";
const B = "bbbb0000000000000000";

/** What the driver hands back for a matrix: BSON dates arrive as `Date`. */
function mongoMatrix(id: unknown, extra: SourceDoc = {}): SourceDoc {
  return {
    _id: id,
    baseline: `v1.base-${String(id)}`,
    baselineSeq: 0,
    headSeq: 2,
    createdDate: "2026-01-01",
    lastWriteDate: "2026-02-01",
    lastReadDate: "2026-03-01",
    lastActivityDate: new Date("2026-03-01T00:00:00Z"),
    writeHash: "hash",
    ...extra,
  };
}

/** An ObjectId as the driver decodes it: an object tagged with `_bsontype`. */
const objectId = { _bsontype: "ObjectId", id: new Uint8Array(12) };

function mongoUpdate(recordId: string, seq: number, extra: SourceDoc = {}): SourceDoc {
  return { _id: objectId, recordId, seq, ciphertext: `v1.${recordId}.${seq}`, clientId: "c", createdAt: "2026-02-01", ...extra };
}

async function* from(docs: SourceDoc[]): AsyncIterable<SourceDoc> {
  yield* docs;
}

let temp: TempDb;
let store: SqliteStore;

beforeEach(() => {
  temp = makeTempDb("riskmapper-copy-");
  store = createStore(openDatabase(temp.file));
});

afterEach(() => {
  store.close();
  temp.remove();
});

describe("matrixFromMongo", () => {
  it("keeps every field and the activity date", () => {
    const res = matrixFromMongo(mongoMatrix(A));
    expect(res).toEqual({
      doc: {
        _id: A,
        baseline: `v1.base-${A}`,
        baselineSeq: 0,
        headSeq: 2,
        createdDate: "2026-01-01",
        lastWriteDate: "2026-02-01",
        lastReadDate: "2026-03-01",
        lastActivityDate: new Date("2026-03-01T00:00:00Z"),
        writeHash: "hash",
      },
      activityDateDerived: false,
    });
  });

  it("derives a missing activity date from the record's latest day", () => {
    const res = matrixFromMongo(mongoMatrix(A, { lastActivityDate: undefined, lastReadDate: null }));
    expect(res!.doc.lastActivityDate).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(res!.activityDateDerived).toBe(true);
  });

  it("turns any other date into a calendar day, never a timestamp", () => {
    const res = matrixFromMongo(mongoMatrix(A, { legacyDate: new Date("2026-02-03T04:05:06Z") }));
    expect((res!.doc as unknown as { legacyDate: unknown }).legacyDate).toBe("2026-02-03");
  });

  it("skips a record the API could never look up", () => {
    expect(matrixFromMongo(mongoMatrix(objectId))).toBeNull();
  });

  it("stops on a value the app never writes, naming the field but not the value", () => {
    expect(() => matrixFromMongo(mongoMatrix(A, { odd: { _bsontype: "Binary", secret: "s3cret" } }))).toThrow(
      /^unsupported Binary value at matrices\.odd$/,
    );
  });
});

describe("updateFromMongo", () => {
  it("drops the old _id, which may be an ObjectId with the edit's time in it", () => {
    expect(updateFromMongo(mongoUpdate(A, 1))).toEqual({
      recordId: A,
      seq: 1,
      ciphertext: `v1.${A}.1`,
      clientId: "c",
      createdAt: "2026-02-01",
    });
  });

  it("skips rows without a string recordId and an integer seq", () => {
    expect(updateFromMongo(mongoUpdate(A, 1.5))).toBeNull();
    expect(updateFromMongo({ ...mongoUpdate(A, 1), recordId: 7 })).toBeNull();
  });
});

describe("replaceWithSource", () => {
  const source = () => ({
    matrices: from([mongoMatrix(A), mongoMatrix(B), mongoMatrix(objectId)]),
    updates: from([
      mongoUpdate(A, 1),
      mongoUpdate(A, 2),
      mongoUpdate(B, 1),
      mongoUpdate("gone0000000000000000", 1),
      mongoUpdate(A, Number.NaN),
    ]),
  });

  it("copies everything reachable and accounts for the rest", async () => {
    const report = await replaceWithSource(store.db, source());

    expect(report).toEqual({
      matrices: { source: 3, copied: 2, skipped: 1, activityDateDerived: 0, inSqlite: 2 },
      updates: { source: 5, copied: 3, orphaned: 1, skipped: 1, inSqlite: 3 },
      chars: { copied: expect.any(Number), inSqlite: expect.any(Number) },
      ok: true,
    });
    expect(report.chars.inSqlite).toBe(report.chars.copied);
    expect(formatReport(report)).toMatch(/OK: SQLite holds exactly what was copied/);
  });

  it("produces records the app reads back exactly as Mongo held them", async () => {
    await replaceWithSource(store.db, source());
    const doc = await store.matrices.findOne({ _id: A });
    expect(doc).toEqual(matrixFromMongo(mongoMatrix(A))!.doc);
    expect(await store.updates.findSorted({ recordId: A, minSeqExclusive: 0 })).toEqual([
      updateFromMongo(mongoUpdate(A, 1)),
      updateFromMongo(mongoUpdate(A, 2)),
    ]);
  });

  it("gives the same result when run again, and drops rows Mongo no longer has", async () => {
    seedMatrix(store.db, matrixDoc({ _id: "stale000000000000000" }));
    await replaceWithSource(store.db, source());
    const first = { m: dumpMatrices(store.db), u: dumpUpdates(store.db) };

    await replaceWithSource(store.db, source());

    expect({ m: dumpMatrices(store.db), u: dumpUpdates(store.db) }).toEqual(first);
    expect(first.m.map((m) => m._id)).toEqual([A, B]);
  });

  it("refuses an empty source and leaves the target as it was", async () => {
    seedMatrix(store.db, matrixDoc({ _id: A }));
    await expect(
      replaceWithSource(store.db, { matrices: from([]), updates: from([]) }),
    ).rejects.toThrow(/no matrices/);
    expect(dumpMatrices(store.db).map((m) => m._id)).toEqual([A]);
    expect(store.db.isTransaction).toBe(false);
  });

  it("rolls back entirely if any row fails", async () => {
    seedMatrix(store.db, matrixDoc({ _id: A }));
    await expect(
      replaceWithSource(store.db, {
        matrices: from([mongoMatrix(B)]),
        updates: from([mongoUpdate(B, 1), mongoUpdate(B, 1)]),
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    expect(dumpMatrices(store.db).map((m) => m._id)).toEqual([A]);
    expect(store.db.isTransaction).toBe(false);
  });
});
