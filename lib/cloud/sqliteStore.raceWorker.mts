/**
 * One contender in the cross-connection race in `sqliteStore.test.ts`. Runs
 * in a worker thread with its own connection to the same file, the way the
 * server and a maintenance job would hold separate connections. Loaded
 * directly by Node, so it follows the import rule in `sqliteStore.mts`.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createStore, openDatabase } from "./sqliteStore.mts";

type Input = {
  file: string;
  id: string;
  legacyId: string;
  appends: number;
  compactTo: number;
  workers: number;
  name: string;
  /** Int32 slots: [0] start gate, [1] arrivals at the second barrier. */
  sync: SharedArrayBuffer;
};

const input = workerData as Input;
const flags = new Int32Array(input.sync);
const store = createStore(openDatabase(input.file));

parentPort!.postMessage({ type: "ready" });
Atomics.wait(flags, 0, 0);

// Phase 1: append. Every call takes the next seq; none may be lost or reused.
const seqs: number[] = [];
for (let i = 0; i < input.appends; i++) {
  const doc = await store.matrices.findOneAndUpdate(
    { _id: input.id },
    { $inc: { headSeq: 1 }, $set: { lastWriteDate: "2026-01-02" } },
    { returnDocument: "after" },
  );
  seqs.push(doc!.headSeq);
  await store.updates.insertOne({
    recordId: input.id,
    seq: doc!.headSeq,
    ciphertext: `v1.${input.name}.${i}`,
    clientId: input.name,
    createdAt: "2026-01-02",
  });
}

// Wait for everyone, so the conditional updates below all land at once.
const arrived = Atomics.add(flags, 1, 1) + 1;
if (arrived === input.workers) {
  Atomics.notify(flags, 1);
} else {
  let seen = arrived;
  while (seen < input.workers) {
    Atomics.wait(flags, 1, seen);
    seen = Atomics.load(flags, 1);
  }
}

// Phase 2: everyone compacts to the same seq and claims the same legacy
// record. Exactly one of each may win.
const compacted = await store.matrices.findOneAndUpdate(
  { _id: input.id, baselineSeq: { $lt: input.compactTo }, headSeq: { $gte: input.compactTo } },
  { $set: { baselineSeq: input.compactTo, baseline: `v1.compacted-by-${input.name}` } },
  { returnDocument: "after" },
);
const claimed = await store.matrices.findOneAndUpdate(
  { _id: input.legacyId, writeHash: { $exists: false } },
  { $set: { writeHash: input.name } },
  { returnDocument: "after" },
);

store.close();
parentPort!.postMessage({
  type: "done",
  seqs,
  compacted: compacted !== null,
  claimed: claimed !== null,
});
