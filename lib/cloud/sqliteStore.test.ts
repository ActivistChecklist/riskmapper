// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDuplicateKey } from "./helpers";
import {
  createStore,
  openDatabase,
  type SqliteStore,
} from "./sqliteStore.mts";
import { dumpUpdates, makeTempDb, matrixDoc, seedMatrix, type TempDb } from "./sqliteTestUtils";
import type { MatrixUpdate } from "./types";
import { claimLegacyRecord } from "./writeAuth";

/**
 * The adapter's own contract: the semantics the route handlers rely on,
 * matching what MongoDB did for the same calls. The handlers are tested
 * against it end to end in `handlers.test.ts`.
 */

const ID = "abcd1234efgh5678ijkl";
const OTHER = "zzzz1234efgh5678ijkl";

let temp: TempDb;
let store: SqliteStore;

beforeEach(() => {
  temp = makeTempDb("riskmapper-store-");
  store = createStore(openDatabase(temp.file));
});

afterEach(() => {
  store.close();
  temp.remove();
});

function update(seq: number, recordId = ID): MatrixUpdate {
  return { recordId, seq, ciphertext: `v1.U${seq}`, clientId: "c", createdAt: "2026-01-02" };
}

describe("matrices", () => {
  it("round-trips a record exactly, including null and absent fields", async () => {
    const doc = matrixDoc({ _id: ID, lastReadDate: null });
    await store.matrices.insertOne(doc);
    const read = await store.matrices.findOne({ _id: ID });
    expect(read).toEqual(doc);
    expect(read!.lastActivityDate).toBeInstanceOf(Date);
    // Absent, not null: `writeHash: { $exists: false }` depends on it.
    expect("writeHash" in read!).toBe(false);
    expect(read!.lastReadDate).toBeNull();
  });

  it("keeps fields it has never heard of, so new ones need no migration", async () => {
    const doc = { ...matrixDoc({ _id: ID }), futureField: { nested: [1, "two"] } };
    await store.matrices.insertOne(doc);
    expect(await store.matrices.findOne({ _id: ID })).toEqual(doc);
  });

  it("stores lastActivityDate as a day, whatever time it is given", async () => {
    await store.matrices.insertOne(
      matrixDoc({ _id: ID, lastActivityDate: new Date("2026-03-04T17:45:12.345Z") }),
    );
    const raw = store.db.prepare("SELECT lastActivityDate FROM matrices").get();
    expect(raw).toEqual({ lastActivityDate: "2026-03-04" });
    expect((await store.matrices.findOne({ _id: ID }))!.lastActivityDate).toEqual(
      new Date("2026-03-04T00:00:00Z"),
    );
  });

  it("refuses a time of day written past the adapter", () => {
    expect(() =>
      store.db
        .prepare("INSERT INTO matrices (id, lastActivityDate, doc) VALUES (?, ?, ?)")
        .run(ID, "2026-03-04T17:45:12Z", "{}"),
    ).toThrow(/CHECK constraint failed/);
  });

  it("reports a duplicate id as a duplicate key", async () => {
    await store.matrices.insertOne(matrixDoc({ _id: ID }));
    const err = await store.matrices.insertOne(matrixDoc({ _id: ID })).catch((e) => e);
    expect(isDuplicateKey(err)).toBe(true);
  });

  it("returns null for a missing record", async () => {
    expect(await store.matrices.findOne({ _id: ID })).toBeNull();
    expect(
      await store.matrices.findOneAndUpdate({ _id: ID }, { $set: { lastReadDate: "2026-01-02" } }, { returnDocument: "after" }),
    ).toBeNull();
  });

  it("deletes a record and its updates together", async () => {
    await store.matrices.insertOne(matrixDoc({ _id: ID, headSeq: 2 }));
    await store.matrices.insertOne(matrixDoc({ _id: OTHER, headSeq: 1 }));
    for (const u of [update(1), update(2), update(1, OTHER)]) await store.updates.insertOne(u);

    await store.matrices.deleteOne({ _id: ID });

    expect(await store.matrices.findOne({ _id: ID })).toBeNull();
    expect(dumpUpdates(store.db).map((u) => u.recordId)).toEqual([OTHER]);
  });

  it("leaves no trace of a deleted record in the database file or its WAL", async () => {
    // "Stop sharing" promises the server copy is gone. secure_delete zeroes
    // the rows; without truncating the WAL, older frames would still hold them.
    const marker = "STOP-SHARING-MARKER";
    await store.matrices.insertOne(matrixDoc({ _id: ID, baseline: `v1.${marker}`, headSeq: 1 }));
    await store.updates.insertOne({ ...update(1), ciphertext: `v1.${marker}` });
    await store.matrices.insertOne(matrixDoc({ _id: OTHER }));
    const onDisk = () =>
      [temp.file, `${temp.file}-wal`].some(
        (f) => existsSync(f) && readFileSync(f).includes(marker),
      );
    expect(onDisk()).toBe(true);

    await store.matrices.deleteOne({ _id: ID });

    expect(onDisk()).toBe(false);
    expect(await store.matrices.findOne({ _id: OTHER })).not.toBeNull();
  });

  it("deletes without waiting on another connection's read", async () => {
    await store.matrices.insertOne(matrixDoc({ _id: ID }));
    const reader = new DatabaseSync(temp.file);
    reader.exec("BEGIN");
    reader.prepare("SELECT count(*) FROM matrices").get();

    const started = Date.now();
    await store.matrices.deleteOne({ _id: ID });
    // The busy timeout is 5s; the truncate gives up at once instead.
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(store.db.prepare("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    expect(await store.matrices.findOne({ _id: ID })).toBeNull();

    reader.exec("COMMIT");
    reader.close();
  });
});

describe("findOneAndUpdate", () => {
  beforeEach(async () => {
    await store.matrices.insertOne(matrixDoc({ _id: ID, baselineSeq: 3, headSeq: 7 }));
  });

  const after = { returnDocument: "after" } as const;

  it("applies $set and returns the document as stored", async () => {
    const res = await store.matrices.findOneAndUpdate(
      { _id: ID },
      { $set: { lastReadDate: "2026-02-02", lastActivityDate: new Date("2026-02-02T09:00:00Z") } },
      after,
    );
    expect(res).toEqual(await store.matrices.findOne({ _id: ID }));
    expect(res!.lastReadDate).toBe("2026-02-02");
    expect(res!.lastActivityDate).toEqual(new Date("2026-02-02T00:00:00Z"));
  });

  it("applies $inc to headSeq alongside $set", async () => {
    const res = await store.matrices.findOneAndUpdate(
      { _id: ID },
      { $inc: { headSeq: 1 }, $set: { lastWriteDate: "2026-02-02" } },
      after,
    );
    expect(res!.headSeq).toBe(8);
    expect(res!.lastWriteDate).toBe("2026-02-02");
  });

  it.each([
    ["baselineSeq $lt equal to it", { baselineSeq: { $lt: 3 } }, false],
    ["baselineSeq $lt above it", { baselineSeq: { $lt: 4 } }, true],
    ["headSeq $gte above it", { headSeq: { $gte: 8 } }, false],
    ["headSeq $gte equal to it", { headSeq: { $gte: 7 } }, true],
    ["both, satisfied", { baselineSeq: { $lt: 7 }, headSeq: { $gte: 7 } }, true],
    ["both, one failing", { baselineSeq: { $lt: 8 }, headSeq: { $gte: 8 } }, false],
  ] as const)("matches %s: %s", async (_label, cond, matches) => {
    const res = await store.matrices.findOneAndUpdate(
      { _id: ID, ...cond },
      { $set: { baseline: "v1.NEW" } },
      after,
    );
    expect(res !== null).toBe(matches);
    expect((await store.matrices.findOne({ _id: ID }))!.baseline).toBe(
      matches ? "v1.NEW" : "v1.BASELINE",
    );
  });

  it("matches writeHash $exists:false only while the record has no hash", async () => {
    const claim = (hash: string) =>
      store.matrices.findOneAndUpdate(
        { _id: ID, writeHash: { $exists: false } },
        { $set: { writeHash: hash } },
        after,
      );
    expect((await claim("first"))!.writeHash).toBe("first");
    expect(await claim("second")).toBeNull();
    expect((await store.matrices.findOne({ _id: ID }))!.writeHash).toBe("first");
  });

  it("rolls back and leaves no transaction open when the update is rejected", async () => {
    await expect(
      store.matrices.findOneAndUpdate({ _id: ID }, { $set: { _id: OTHER } }, after),
    ).rejects.toThrow(/immutable/);
    expect(store.db.isTransaction).toBe(false);
    expect((await store.matrices.findOne({ _id: ID }))!.headSeq).toBe(7);
  });

  it("hands out every seq exactly once to overlapping appends", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        store.matrices.findOneAndUpdate({ _id: ID }, { $inc: { headSeq: 1 }, $set: {} }, after),
      ),
    );
    expect(results.map((r) => r!.headSeq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => 8 + i),
    );
  });

  it("lets exactly one of several overlapping legacy claims win", async () => {
    seedMatrix(store.db, matrixDoc({ _id: OTHER }));
    const results = await Promise.all(
      ["a", "b", "c", "d"].map((h) => claimLegacyRecord(store.matrices, OTHER, h)),
    );
    const stored = (await store.matrices.findOne({ _id: OTHER }))!.writeHash;
    // Every claimant is told the same winner.
    expect(new Set(results)).toEqual(new Set([stored]));
  });
});

describe("updates", () => {
  beforeEach(async () => {
    await store.matrices.insertOne(matrixDoc({ _id: ID }));
    await store.matrices.insertOne(matrixDoc({ _id: OTHER }));
  });

  it("returns a record's updates in seq order, after minSeqExclusive", async () => {
    for (const seq of [3, 1, 2, 5]) await store.updates.insertOne(update(seq));
    await store.updates.insertOne(update(4, OTHER));

    const all = await store.updates.findSorted({ recordId: ID });
    expect(all.map((u) => u.seq)).toEqual([1, 2, 3, 5]);
    expect(all[0]).toEqual(update(1));
    const later = await store.updates.findSorted({ recordId: ID, minSeqExclusive: 2 });
    expect(later.map((u) => u.seq)).toEqual([3, 5]);
  });

  it("reports a reused seq as a duplicate key", async () => {
    await store.updates.insertOne(update(1));
    const err = await store.updates.insertOne(update(1)).catch((e) => e);
    expect(isDuplicateKey(err)).toBe(true);
  });

  it("refuses an update for a record that does not exist", async () => {
    const err = await store.updates.insertOne(update(1, "nobody00000000000000")).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isDuplicateKey(err)).toBe(false);
  });

  it("never stores the _id a caller passes", async () => {
    await store.updates.insertOne({ ...update(1), _id: `${ID}:1` });
    expect(await store.updates.findSorted({ recordId: ID })).toEqual([update(1)]);
  });

  it("prunes up to a seq, and deletes a record's whole log, without touching others", async () => {
    for (const seq of [1, 2, 3]) await store.updates.insertOne(update(seq));
    await store.updates.insertOne(update(1, OTHER));

    expect(await store.updates.deleteUpToSeq({ recordId: ID, maxSeqInclusive: 2 })).toEqual({
      deletedCount: 2,
    });
    expect((await store.updates.findSorted({ recordId: ID })).map((u) => u.seq)).toEqual([3]);

    expect(await store.updates.deleteMany({ recordId: ID })).toEqual({ deletedCount: 1 });
    expect(dumpUpdates(store.db).map((u) => u.recordId)).toEqual([OTHER]);
  });
});

describe("across connections", () => {
  // `node:sqlite` is synchronous, so in one process the transaction can't
  // be interleaved anyway. These workers each hold their own connection and
  // genuinely run at once, which is what the server and a maintenance job
  // look like. A read-then-write without the transaction loses seqs here.
  it("serializes appends, compactions and claims from separate connections", async () => {
    const workers = 4;
    const appends = 40;
    const legacyId = "legacy00000000000000";
    seedMatrix(store.db, matrixDoc({ _id: ID }));
    seedMatrix(store.db, matrixDoc({ _id: legacyId }));

    const sync = new SharedArrayBuffer(8);
    const flags = new Int32Array(sync);
    type Done = { type: "done"; seqs: number[]; compacted: boolean; claimed: boolean };
    const ready: Promise<void>[] = [];
    const done: Promise<Done>[] = [];
    for (let w = 0; w < workers; w++) {
      const worker = new Worker(path.join(import.meta.dirname, "sqliteStore.raceWorker.mts"), {
        workerData: { file: temp.file, id: ID, legacyId, appends, compactTo: 10, workers, name: `w${w}`, sync },
      });
      let onReady: () => void;
      ready.push(new Promise((r) => (onReady = r)));
      done.push(
        new Promise((resolve, reject) => {
          worker.on("message", (m: { type: string }) =>
            m.type === "ready" ? onReady() : resolve(m as Done),
          );
          worker.on("error", reject);
        }),
      );
    }
    await Promise.all(ready);
    Atomics.store(flags, 0, 1);
    Atomics.notify(flags, 0);
    const results = await Promise.all(done);

    const total = workers * appends;
    const seqs = results.flatMap((r) => r.seqs).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    const final = (await store.matrices.findOne({ _id: ID }))!;
    expect(final.headSeq).toBe(total);
    expect(dumpUpdates(store.db)).toHaveLength(total);

    expect(results.filter((r) => r.compacted)).toHaveLength(1);
    expect(final.baselineSeq).toBe(10);
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
  }, 30_000);
});
