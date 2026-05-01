import { MongoClient } from "mongodb";
import {
  MONGO_COLLECTION,
  MONGO_DB,
  MONGO_UPDATES_COLLECTION,
  MONGO_URI,
} from "./config";
import type {
  AppCollection,
  MatrixDoc,
  MatrixUpdate,
  UpdatesCollection,
} from "./types";

/**
 * Lazy MongoDB client + collection accessors.
 *
 * Caches the connect promise on `globalThis` in development so Next.js
 * hot-reload doesn't open a new connection on every code change. Production
 * caches it on a module-local binding (each lambda / serverful instance
 * holds one connection).
 */

const g = globalThis as typeof globalThis & {
  _riskmatrixMongoPromise?: Promise<MongoClient>;
  _riskmatrixIndexed?: boolean;
};

let cachedClientPromise: Promise<MongoClient> | null =
  process.env.NODE_ENV === "development" ? (g._riskmatrixMongoPromise ?? null) : null;

async function getClient(): Promise<MongoClient> {
  if (!cachedClientPromise) {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not set");
    }
    const client = new MongoClient(MONGO_URI);
    cachedClientPromise = client.connect();
    if (process.env.NODE_ENV === "development") {
      g._riskmatrixMongoPromise = cachedClientPromise;
    }
  }
  return cachedClientPromise;
}

export async function getCollection(): Promise<AppCollection> {
  const client = await getClient();
  const coll = client.db(MONGO_DB).collection<MatrixDoc>(MONGO_COLLECTION);
  await ensureIndexes(client);
  return coll as AppCollection;
}

export async function getUpdatesCollection(): Promise<UpdatesCollection> {
  const client = await getClient();
  const raw = client
    .db(MONGO_DB)
    .collection<MatrixUpdate>(MONGO_UPDATES_COLLECTION);
  await ensureIndexes(client);
  return {
    async insertOne(doc) {
      return raw.insertOne(doc);
    },
    async findSorted(filter) {
      const q: Record<string, unknown> = { recordId: filter.recordId };
      if (filter.minSeqExclusive !== undefined) {
        q.seq = { $gt: filter.minSeqExclusive };
      }
      return raw.find(q).sort({ seq: 1 }).toArray();
    },
    async deleteMany(filter) {
      const res = await raw.deleteMany({ recordId: filter.recordId });
      return { deletedCount: res.deletedCount };
    },
  };
}

async function ensureIndexes(client: MongoClient): Promise<void> {
  if (g._riskmatrixIndexed) return;
  g._riskmatrixIndexed = true;
  const matrices = client.db(MONGO_DB).collection<MatrixDoc>(MONGO_COLLECTION);
  const updates = client
    .db(MONGO_DB)
    .collection<MatrixUpdate>(MONGO_UPDATES_COLLECTION);
  void Promise.all([
    matrices.createIndex({ lastReadDate: 1 }),
    matrices.createIndex({ lastWriteDate: 1 }),
    // Per-record monotonic seq lookups; uniqueness defends against any race
    // where two appends somehow collide on the same seq.
    updates.createIndex({ recordId: 1, seq: 1 }, { unique: true }),
  ]).catch(() => {
    g._riskmatrixIndexed = false;
  });
}
