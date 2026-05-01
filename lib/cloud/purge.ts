import { getRetentionDays } from "./config";
import { getCollection } from "./db";

/**
 * Purge records that have been silent (no read AND no write) for more than
 * `RETENTION_DAYS`. Intended to run as a daily cron — wire up via Vercel
 * Cron (`/app/api/cron/purge/route.ts`) or your platform's equivalent.
 *
 * NOTE: this only purges the matrix records. Orphaned rows in the
 * `matrix_updates` collection (whose recordId no longer matches any
 * matrix doc) are not yet cleaned up here — add a separate sweep when
 * disk usage starts to matter.
 */
export async function purgeStaleRecords(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getRetentionDays() * 86400_000)
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
