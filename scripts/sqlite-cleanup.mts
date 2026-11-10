/**
 * Daily cleanup: delete shared matrices idle for `RETENTION_DAYS` (default
 * 90) days, their updates, and any orphaned update rows. See
 * `lib/cloud/cleanup.mts` for what it deletes and why.
 *
 *   SQLITE_PATH=/path/to/riskmapper.sqlite node scripts/sqlite-cleanup.mts
 *
 * Runs straight from the source tree with Node's type stripping, no build
 * step. Refuses to create a database: a job pointed at the wrong path fails
 * instead of reporting a clean run on an empty file. Prints counts only.
 */
import { cleanupDatabase, retentionDaysFromEnv } from "../lib/cloud/cleanup.mts";
import { openDatabase, sqlitePathFromEnv } from "../lib/cloud/sqliteStore.mts";

try {
  const retentionDays = retentionDaysFromEnv();
  const db = openDatabase(sqlitePathFromEnv(), { create: false });
  try {
    const r = cleanupDatabase(db, { retentionDays });
    console.log(
      `sqlite-cleanup: deleted ${r.matrices} matrices idle since ${r.cutoffDay} or earlier, ` +
        `${r.updates} of their updates, and ${r.orphanUpdates} orphaned updates` +
        (r.walTruncated ? "" : " (WAL busy, not truncated; next run retries)"),
    );
  } finally {
    db.close();
  }
} catch (err) {
  console.error("sqlite-cleanup failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
