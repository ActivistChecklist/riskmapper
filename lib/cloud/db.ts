import { MongoClient } from "mongodb";
import { MONGO_COLLECTION, MONGO_DB, MONGO_URI } from "./config";
import type { AppCollection, MatrixDoc } from "./types";

/**
 * Lazy MongoDB client + collection accessor.
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

export async function getCollection(): Promise<AppCollection> {
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
  const client = await cachedClientPromise;
  const coll = client.db(MONGO_DB).collection<MatrixDoc>(MONGO_COLLECTION);
  if (!g._riskmatrixIndexed) {
    g._riskmatrixIndexed = true;
    // Fire-and-forget — index creation is idempotent and we don't want to
    // block first request on it.
    void Promise.all([
      coll.createIndex({ lastReadDate: 1 }),
      coll.createIndex({ lastWriteDate: 1 }),
    ]).catch(() => {
      // Reset the flag so a later request can retry index creation.
      g._riskmatrixIndexed = false;
    });
  }
  return coll as AppCollection;
}
