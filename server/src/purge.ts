import { RETENTION_DAYS } from "./config.js";
import { getCollection } from "./db.js";

/**
 * Purge records that have been silent (no read AND no write) for more than
 * RETENTION_DAYS.
 *
 * Run as a daily cron (Railway scheduled job, or simple setInterval in
 * single-instance deploys).
 */
export async function purgeStaleRecords(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400_000)
    .toISOString()
    .slice(0, 10);
  const coll = await getCollection();
  const res = await coll.deleteMany({
    $and: [
      { $or: [{ lastReadDate: null }, { lastReadDate: { $lt: cutoff } }] },
      { lastWriteDate: { $lt: cutoff } },
    ],
  });
  return res.deletedCount ?? 0;
}
