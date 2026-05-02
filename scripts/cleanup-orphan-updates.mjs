/**
 * Sweep `matrix_updates` rows whose parent matrix no longer exists.
 *
 * Why this exists: the matrices collection has a Mongo TTL index on
 * `lastActivityDate` (see `lib/cloud/db.ts`). When a matrix is idle for
 * 90+ days the Mongo daemon deletes the matrix doc, but TTL is single-
 * collection only, so its updates orphan in place. Running this script
 * on a schedule completes the cascade.
 *
 * Explicit DELETE /api/matrix/:id already cascades atomically in the
 * route handler — this script only handles the TTL-driven case.
 *
 * Wired as a Railway cron via `railway.json` (one daily run is plenty
 * given retention is measured in days).
 *
 * Plain `.mjs` so the cron doesn't need a TypeScript build step.
 */

import { MongoClient } from "mongodb";

const MONGO_URL = process.env.MONGO_URL ?? "";
const MONGO_DB = process.env.MONGO_DB ?? "riskmatrix";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION ?? "matrices";
const MONGO_UPDATES_COLLECTION =
  process.env.MONGO_UPDATES_COLLECTION ?? "matrix_updates";

async function main() {
  if (!MONGO_URL) {
    console.error("MONGO_URL is not set");
    process.exit(1);
  }
  const client = await MongoClient.connect(MONGO_URL);
  try {
    const db = client.db(MONGO_DB);
    const matrices = db.collection(MONGO_COLLECTION);
    const updates = db.collection(MONGO_UPDATES_COLLECTION);

    // Build the live recordId set. For the expected scale of this app
    // (low thousands of matrices) loading the ids is cheap; if it ever
    // stops being cheap, switch to a streaming $lookup pipeline that
    // anti-joins updates against matrices.
    const liveIds = await matrices
      .find({}, { projection: { _id: 1 } })
      .map((d) => d._id)
      .toArray();
    const liveSet = new Set(liveIds);

    const recordIds = await updates.distinct("recordId");
    const orphanIds = recordIds.filter((id) => !liveSet.has(id));

    if (orphanIds.length === 0) {
      console.log(
        `cleanup-orphan-updates: nothing to do (matrices=${liveSet.size}, distinct-update-records=${recordIds.length})`,
      );
      return;
    }

    const res = await updates.deleteMany({ recordId: { $in: orphanIds } });
    console.log(
      `cleanup-orphan-updates: removed ${res.deletedCount ?? 0} update rows across ${orphanIds.length} orphan record(s)`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("cleanup-orphan-updates failed:", err);
  process.exit(1);
});
