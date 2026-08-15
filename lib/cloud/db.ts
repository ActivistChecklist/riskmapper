import { MongoClient } from "mongodb";
import {
  MONGO_COLLECTION,
  MONGO_DB,
  MONGO_UPDATES_COLLECTION,
  MONGO_URL,
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
 * Caches the connect promise so one instance holds one connection, on
 * `globalThis` in development (so a reloading dev process doesn't open a new
 * connection per change) and on a module-local binding otherwise.
 *
 * A *failed* attempt is deliberately not cached — see `getClient`.
 */

const g = globalThis as typeof globalThis & {
  _riskmatrixMongoPromise?: Promise<MongoClient>;
  _riskmatrixIndexed?: boolean;
};

let cachedClientPromise: Promise<MongoClient> | null =
  process.env.NODE_ENV === "development" ? (g._riskmatrixMongoPromise ?? null) : null;

async function getClient(): Promise<MongoClient> {
  if (!cachedClientPromise) {
    if (!MONGO_URL) {
      throw new Error("MONGO_URL is not set");
    }
    const client = new MongoClient(MONGO_URL);
    // Evict a failed attempt instead of caching the rejection. Caching it
    // means one transient outage (Mongo restarting, a failover, the dev
    // container not up yet) bricks every later request for the lifetime of
    // the process, because each call re-awaits the same rejected promise.
    // That is survivable under a framework that reloads modules, but this
    // server is long-lived: it would need a manual restart to recover.
    const attempt: Promise<MongoClient> = client.connect().catch((err) => {
      if (cachedClientPromise === attempt) cachedClientPromise = null;
      if (g._riskmatrixMongoPromise === attempt) {
        g._riskmatrixMongoPromise = undefined;
      }
      // Release the socket; a retry builds a fresh client.
      void client.close().catch(() => {});
      throw err;
    });
    cachedClientPromise = attempt;
    if (process.env.NODE_ENV === "development") {
      g._riskmatrixMongoPromise = attempt;
    }
  }
  return cachedClientPromise;
}

/** Drops any cached connection. Tests only. */
export function __resetDbForTests(): void {
  cachedClientPromise = null;
  g._riskmatrixMongoPromise = undefined;
  g._riskmatrixIndexed = false;
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
    async deleteUpToSeq(filter) {
      const res = await raw.deleteMany({
        recordId: filter.recordId,
        seq: { $lte: filter.maxSeqInclusive },
      });
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
    // TTL index: Mongo's background daemon deletes any matrix whose
    // `lastActivityDate` is older than 90 days. Activity is bumped on
    // every read and write (see server/routes/matrix*.ts), so this expires
    // only genuinely-idle records. Fires the deletion of the matrix doc
    // itself; orphaned `matrix_updates` rows are swept by the cleanup
    // cron in `scripts/cleanup-orphan-updates.ts`.
    matrices.createIndex(
      { lastActivityDate: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 },
    ),
    // Per-record monotonic seq lookups; uniqueness defends against any race
    // where two appends somehow collide on the same seq.
    updates.createIndex({ recordId: 1, seq: 1 }, { unique: true }),
  ]).catch((err) => {
    // Swallow-and-retry: if Mongo rejected the spec (e.g. an old index
    // with conflicting options), unflag so the next request retries.
    // Log loudly so a stuck deploy is visible in Railway logs instead
    // of silently shipping with no TTL enforcement.
    console.error("ensureIndexes failed:", err);
    g._riskmatrixIndexed = false;
  });
}
