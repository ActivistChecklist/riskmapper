import type { AppCollection, MatrixDoc } from "./types";

/**
 * In-memory implementation of the small subset of MongoDB methods that the
 * cloud handlers use. Used by tests and only by tests; behavior matches the
 * real driver for the queries the app issues:
 *
 *   - `insertOne`: throws E11000 (`code: 11000`) on duplicate `_id`
 *   - `findOne({ _id })`: returns the doc or null
 *   - `findOneAndUpdate({ _id, version? }, { $set, $inc? })`: applies the
 *     update IFF the version predicate matches (or is absent), returning
 *     the resulting doc
 *   - `deleteOne({ _id })`: removes the doc, no-op if absent
 */
export function createFakeCollection(): AppCollection & {
  __dump(): MatrixDoc[];
  __seed(doc: MatrixDoc): void;
  __setInsertError(err: unknown): void;
} {
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
      if (filter.version !== undefined && doc.version !== filter.version) {
        return null;
      }
      const next: MatrixDoc = { ...doc, ...update.$set };
      if ("$inc" in update && update.$inc?.version !== undefined) {
        next.version = doc.version + update.$inc.version;
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
