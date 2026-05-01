import type {
  AppCollection,
  MatrixDoc,
  MatrixUpdate,
  UpdatesCollection,
} from "./types";

/**
 * In-memory implementations of the Mongo surfaces the cloud handlers use.
 * Used by tests only; behavior matches the real driver for the queries the
 * app actually issues.
 */

export type FakeCollection = AppCollection & {
  __dump(): MatrixDoc[];
  __seed(doc: MatrixDoc): void;
  __setInsertError(err: unknown): void;
};

export type FakeUpdatesCollection = UpdatesCollection & {
  __dump(): MatrixUpdate[];
  __seed(doc: MatrixUpdate): void;
};

export function createFakeCollection(): FakeCollection {
  const store = new Map<string, MatrixDoc>();
  let injectedInsertError: unknown = null;

  return {
    async insertOne(doc: MatrixDoc): Promise<unknown> {
      if (injectedInsertError !== null) {
        const err = injectedInsertError;
        injectedInsertError = null;
        throw err;
      }
      if (store.has(doc._id)) {
        const dup = new Error("E11000 duplicate key");
        Object.assign(dup, { code: 11000 });
        throw dup;
      }
      store.set(doc._id, { ...doc });
      return { acknowledged: true, insertedId: doc._id };
    },

    async findOne(filter): Promise<MatrixDoc | null> {
      const doc = store.get(filter._id);
      return doc ? { ...doc } : null;
    },

    async findOneAndUpdate(filter, update): Promise<MatrixDoc | null> {
      const doc = store.get(filter._id);
      if (!doc) return null;
      const next: MatrixDoc = { ...doc };
      if ("$set" in update && update.$set) {
        Object.assign(next, update.$set);
      }
      if ("$inc" in update && update.$inc) {
        if (typeof update.$inc.headSeq === "number") {
          next.headSeq = doc.headSeq + update.$inc.headSeq;
        }
      }
      store.set(doc._id, next);
      return { ...next };
    },

    async deleteOne(filter): Promise<unknown> {
      const existed = store.delete(filter._id);
      return { acknowledged: true, deletedCount: existed ? 1 : 0 };
    },

    async deleteMany(): Promise<{ deletedCount?: number }> {
      // Used by purge.ts; tests don't exercise the predicate-matching path
      // since purge() isn't called from any test today. If tests ever use
      // it, expand this to evaluate the filter against `store`.
      const n = store.size;
      store.clear();
      return { deletedCount: n };
    },

    __dump(): MatrixDoc[] {
      return Array.from(store.values()).map((d) => ({ ...d }));
    },
    __seed(doc: MatrixDoc): void {
      store.set(doc._id, { ...doc });
    },
    __setInsertError(err: unknown): void {
      injectedInsertError = err;
    },
  };
}

export function createFakeUpdatesCollection(): FakeUpdatesCollection {
  const store: MatrixUpdate[] = [];

  return {
    async insertOne(doc: MatrixUpdate): Promise<unknown> {
      const dup = store.find(
        (u) => u.recordId === doc.recordId && u.seq === doc.seq,
      );
      if (dup) {
        const err = new Error("E11000 duplicate key");
        Object.assign(err, { code: 11000 });
        throw err;
      }
      store.push({ ...doc });
      return { acknowledged: true };
    },

    async findSorted(filter): Promise<MatrixUpdate[]> {
      const min = filter.minSeqExclusive ?? -Infinity;
      return store
        .filter((u) => u.recordId === filter.recordId && u.seq > min)
        .sort((a, b) => a.seq - b.seq)
        .map((u) => ({ ...u }));
    },

    async deleteMany(filter): Promise<{ deletedCount?: number }> {
      let removed = 0;
      for (let i = store.length - 1; i >= 0; i--) {
        if (store[i].recordId === filter.recordId) {
          store.splice(i, 1);
          removed += 1;
        }
      }
      return { deletedCount: removed };
    },

    __dump(): MatrixUpdate[] {
      return store.map((u) => ({ ...u })).sort((a, b) => a.seq - b.seq);
    },
    __seed(doc: MatrixUpdate): void {
      store.push({ ...doc });
    },
  };
}
